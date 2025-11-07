"""Optimized itinerary_agent MCP server
- Stabilized async session management (single aiohttp.ClientSession via get_session)
- Optional Redis support with a safe fallback to in-memory cache
- Clearer retry/cache behavior and improved error handling
- Cleaner MCP server startup with proper event-loop/thread handling
- Signal-based graceful shutdown and atexit cleanup
- Typed functions and shorter, well-documented helpers

Make sure to set environment variables:
- GOOGLE_APPLICATION_CREDENTIALS
- GOOGLE_MAPS_API_KEY
- WEATHER_API_KEY (optional)
- REDIS_URL (optional)
"""

from __future__ import annotations
import asyncio
import json
import logging
import os
import signal
import threading
import time
import atexit
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp
from pydantic import BaseModel, Field, ConfigDict
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

# External project-specific imports (ensure these packages are available)
from fastmcp import FastMCP
from firestore_client import FirestoreClient
from dotenv import load_dotenv

load_dotenv()

# ----- Logging -----
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("itinerary_agent")

# ----- Globals & constants -----
mcp = FastMCP("itinerary_agent")
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

# Optional Redis client placeholder (attempt to import/use if REDIS_URL set)
redis_client = None
REDIS_URL = os.getenv("REDIS_URL")
try:
    if REDIS_URL:
        import aioredis as _aioredis

        redis_client = _aioredis.from_url(REDIS_URL, decode_responses=True)
        logger.info("Redis configured from REDIS_URL")
except Exception as e:
    logger.warning("Redis not available or failed to init: %s", e)
    redis_client = None

# In-memory fallback cache
class SimpleCache:
    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}
        self._expiry: Dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[Any]:
        if not key:
            return None
        async with self._lock:
            if key in self._expiry and self._expiry[key] < time.time():
                self._cache.pop(key, None)
                self._expiry.pop(key, None)
                return None
            return self._cache.get(key)

    async def set(self, key: str, value: Any, ex: Optional[int] = None) -> None:
        if not key:
            return
        async with self._lock:
            self._cache[key] = value
            if ex is not None:
                self._expiry[key] = time.time() + ex

_local_cache = SimpleCache()

# URLs and config
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
WEATHER_URL = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline"
CACHE_TTL = int(os.getenv("CACHE_TTL", "3600"))
CONCURRENT_REQUESTS = int(os.getenv("CONCURRENT_REQUESTS", "10"))

# Global aiohttp session singleton + semaphore for concurrency
_aiohttp_session: Optional[aiohttp.ClientSession] = None
_session_lock = asyncio.Lock()
_semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)

async def get_session() -> aiohttp.ClientSession:
    """Create or return a global aiohttp session. Safe to call concurrently."""
    global _aiohttp_session
    async with _session_lock:
        if _aiohttp_session is None or _aiohttp_session.closed:
            timeout = aiohttp.ClientTimeout(total=30, connect=10)
            connector = aiohttp.TCPConnector(limit_per_host=CONCURRENT_REQUESTS, ttl_dns_cache=300)
            _aiohttp_session = aiohttp.ClientSession(timeout=timeout, connector=connector, json_serialize=json.dumps,
                                                    headers={
                                                        "Content-Type": "application/json",
                                                        "User-Agent": "DynoTrip/1.0",
                                                    })
            logger.info("Created new aiohttp.ClientSession")
    return _aiohttp_session

async def close_session() -> None:
    global _aiohttp_session
    if _aiohttp_session and not _aiohttp_session.closed:
        await _aiohttp_session.close()
        logger.info("Closed global aiohttp session")

# Register atexit -- use asyncio.run in order to close session even if loop not running
def _atexit_cleanup() -> None:
    try:
        asyncio.run(close_session())
    except Exception:
        # If close_session fails here, there's not much we can do during process exit
        pass

atexit.register(_atexit_cleanup)

# Cache helpers (first try redis, then fallback to in-memory)
async def _get_cache(key: str) -> Optional[Any]:
    if not key:
        return None
    try:
        if redis_client:
            raw = await redis_client.get(f"dynotrip:{key}")
            return json.loads(raw) if raw else None
    except Exception as e:
        logger.debug("Redis get failed: %s", e)
    return await _local_cache.get(key)

async def _set_cache(key: str, value: Any, ttl: int = CACHE_TTL) -> None:
    if not key or value is None:
        return
    try:
        if redis_client:
            await redis_client.set(f"dynotrip:{key}", json.dumps(value, default=str), ex=ttl)
            return
    except Exception as e:
        logger.debug("Redis set failed: %s", e)
    await _local_cache.set(key, value, ex=ttl)

# Basic retry wrapper for external HTTP operations
retry_on_network = dict(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10),
                        retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError)))

# -------------------- Place / Geocode / Weather helpers --------------------
@retry(**retry_on_network)
async def _places_search_async(text_query: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    if not text_query:
        return None
    cache_key = f"places:search:{text_query.lower().strip()}"
    if cached := await _get_cache(cache_key):
        return cached

    url = f"{PLACES_BASE_URL}:searchText"
    headers = {"X-Goog-Api-Key": api_key}
    payload = {"textQuery": text_query, "maxResultCount": 1, "languageCode": "en"}

    async with _semaphore:
        async with session.post(url, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            data = await resp.json()
            result = (data.get("places") or [None])[0]
            if result:
                await _set_cache(cache_key, result)
            return result

@retry(**retry_on_network)
async def _places_details_async(place_id: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    if not place_id:
        return None
    cache_key = f"places:details:{place_id}"
    if cached := await _get_cache(cache_key):
        return cached

    url = f"{PLACES_BASE_URL}/{place_id}"
    params = {"key": api_key, "fieldMask": "rating,userRatingCount,photos,reviews,websiteUri,nationalPhoneNumber"}

    async with _semaphore:
        async with session.get(url, params=params) as resp:
            resp.raise_for_status()
            result = await resp.json()
            await _set_cache(cache_key, result)
            return result

@retry(**retry_on_network)
async def _geocode_address_async(address: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    if not address:
        return None
    cache_key = f"geocode:{address.lower().strip()}"
    if cached := await _get_cache(cache_key):
        return cached

    params = {"address": address, "key": api_key, "language": "en"}
    async with _semaphore:
        async with session.get(GEOCODE_URL, params=params) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if results := data.get("results"):
                loc = results[0].get("geometry", {}).get("location")
                if loc:
                    result = {"lat": float(loc.get("lat", 0)), "lng": float(loc.get("lng", 0))}
                    await _set_cache(cache_key, result)
                    return result
    return None

@retry(**retry_on_network)
async def _fetch_weather_summary_async(lat: float, lng: float, days: int = 3, api_key: Optional[str] = None) -> Dict[str, Any]:
    api_key = api_key or os.getenv("WEATHER_API_KEY")
    if not api_key:
        return {}
    cache_key = f"weather:{lat:.4f},{lng:.4f}:{days}"
    if cached := await _get_cache(cache_key):
        return cached

    params = {"key": api_key, "unitGroup": "metric", "include": "days", "elements": "temp,conditions", "contentType": "json"}
    url = f"{WEATHER_URL}/{lat},{lng}/next{days}days"

    async with _semaphore:
        sess = await get_session()
        async with sess.get(url, params=params) as resp:
            resp.raise_for_status()
            data = await resp.json()
            if "days" in data:
                result = {
                    day["datetime"]: {
                        "summary": day.get("conditions", "Unknown"),
                        "avg_temp": day.get("temp"),
                        "temp_min": day.get("tempmin"),
                        "temp_max": day.get("tempmax"),
                    }
                    for day in data["days"]
                }
                await _set_cache(cache_key, result, ttl=3600)
                return result
    return {}

# -------------------- Pydantic request models --------------------
class PlaceSearchRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    text_query: str
    session: aiohttp.ClientSession
    result: dict = Field(default_factory=dict)
    future: Optional[asyncio.Future] = None

class PlaceDetailsRequest(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    place_id: str
    session: aiohttp.ClientSession
    result: dict = Field(default_factory=dict)
    future: Optional[asyncio.Future] = None

# -------------------- MCP tool endpoints --------------------
@mcp.tool
def health_check() -> dict:
    return {"status": "ok", "service": "itinerary_agent"}

@mcp.tool
def get_travel_options(frm: str, to: str, depart_date: Optional[str] = None) -> Any:
    return firestore_client.get_travel_options(frm, to, depart_date)

@mcp.tool
def get_accommodation(city: str) -> Any:
    return firestore_client.get_accommodation(city)

# Async place-details tool
@mcp.tool
async def place_details_async(query: str) -> dict:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return {"error": "GOOGLE_MAPS_API_KEY not configured"}
    if not query:
        return {"error": "query cannot be empty"}

    sess = await get_session()

    try:
        found = await _places_search_async(query, api_key, sess)
        if not found:
            return {"error": "Place not found"}

        place_id = found.get("id")
        if not place_id:
            # try to parse name-like field
            name_field = found.get("name", "")
            if isinstance(name_field, str) and name_field.startswith("places/"):
                place_id = name_field.split("/", 1)[1]

        if not place_id:
            return {"error": "Could not extract place ID"}

        details = await _places_details_async(place_id, api_key, sess)
        if not details:
            return {"error": "Could not fetch place details"}

        # photos
        photos: List[str] = []
        for i, p in enumerate(details.get("photos", [])[:3]):
            pname = p.get("name") or ""
            photo_ref = pname.split("/")[-1]
            photos.append(f"{PLACES_BASE_URL}/{place_id}/photos/{photo_ref}/media?key={api_key}&maxWidthPx=600")
            if i < 2:
                await asyncio.sleep(0.05)

        reviews = [r.get("text", "").strip() for r in details.get("reviews", [])[:3] if r.get("text")]

        rating = details.get("rating")
        try:
            rating = float(rating) if rating is not None else None
        except Exception:
            rating = None

        total_ratings = details.get("userRatingCount")
        try:
            total_ratings = int(total_ratings) if total_ratings is not None else 0
        except Exception:
            total_ratings = 0

        address = found.get("formattedAddress") or found.get("address") or ""
        website = details.get("websiteUri") or found.get("websiteUri")
        phone = details.get("nationalPhoneNumber") or details.get("phoneNumber")
        opening_hours = details.get("regularOpeningHours") or {}

        return {
            "name": found.get("displayName", {}).get("text", query) if isinstance(found.get("displayName"), dict) else (found.get("displayName") or query),
            "address": address,
            "rating": rating,
            "total_ratings": total_ratings,
            "photos": photos,
            "reviews": reviews,
            "website": website,
            "phone": phone,
            "opening_hours": opening_hours,
            "google_maps_url": found.get("googleMapsUri"),
        }

    except Exception as exc:
        logger.exception("place_details_async failed for %s", query)
        return {"error": f"Failed to fetch place details: {str(exc)}"}

# Sync wrapper
@mcp.tool
def place_details(query: str) -> dict:
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # run in a new thread-safe loop
            return asyncio.run(place_details_async(query))
        return loop.run_until_complete(place_details_async(query))
    except Exception as e:
        logger.exception("place_details wrapper failed")
        return {"error": str(e)}

# Batch version
@mcp.tool
async def batch_place_details(queries: List[str]) -> Dict[str, dict]:
    if not queries:
        return {}

    # dedupe-preserve-order
    unique = []
    seen = set()
    for q in queries:
        if q and q not in seen:
            seen.add(q)
            unique.append(q)

    results: Dict[str, dict] = {}
    batch_size = 10
    for i in range(0, len(unique), batch_size):
        batch = unique[i : i + batch_size]
        tasks = [asyncio.create_task(place_details_async(q)) for q in batch]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        for q, res in zip(batch, batch_results):
            if isinstance(res, Exception):
                logger.warning("batch_place_details: error for %s -> %s", q, res)
                results[q] = {"error": str(res)}
            else:
                # extract top 2 review texts if present in raw details
                try:
                    if "reviews" in res and isinstance(res["reviews"], list):
                        results[q] = res
                        # already short-circuited reviews in place_details_async
                    else:
                        results[q] = res
                except Exception as e:
                    logger.exception("Error processing result for %s: %s", q, e)
                    results[q] = {"error": str(e)}
        if i + batch_size < len(unique):
            await asyncio.sleep(0.2)
    return results

# -------------------- MCP server start/stop helpers --------------------
_mcp_server_task: Optional[asyncio.Task] = None

def _run_mcp_server(port: int):
    """Run MCP server (blocking call)"""
    try:
        logger.info("Starting MCP server at 0.0.0.0:%d", port)
        # set env so other services can discover
        os.environ["MCP_SERVER_URL"] = f"http://127.0.0.1:{port}/mcp"
        mcp.run(transport="http", host="0.0.0.0", port=port)
    except Exception as e:
        logger.exception("MCP server failed: %s", e)


def start_mcp_in_thread(port: int = 8081) -> threading.Thread:
    """Starts the MCP server in a clean background thread."""
    def _target() -> None:
        try:
            _run_mcp_server(port)
        except Exception as e:
            logger.exception("MCP server thread failed: %s", e)

    t = threading.Thread(target=_target, daemon=True)
    t.start()
    time.sleep(1)  # Small delay to ensure server starts
    return t

# Graceful shutdown wiring
def _graceful_shutdown(signum, frame):
    logger.info("Received signal %s, shutting down...", signum)
    try:
        asyncio.run(close_session())
    except Exception:
        pass
    # allow process to exit
    raise SystemExit(0)

for sig in (signal.SIGINT, signal.SIGTERM):
    try:
        signal.signal(sig, _graceful_shutdown)
    except Exception:
        # Not all platforms support setting signal handlers (e.g., Windows in some contexts)
        pass

# Entrypoint
def main() -> int:
    port = int(os.getenv("MCP_PORT", "8081"))
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            logger.info("Detected running event loop; starting MCP server in background thread")
            start_mcp_in_thread(port)
            return 0
    except RuntimeError:
        pass  # No active loop

    try:
        asyncio.run(_run_mcp_server(port))
        return 0
    except RuntimeError as e:
        # If loop is already running, fallback to thread
        if "already running" in str(e).lower():
            logger.warning("Falling back to thread-based start due to running loop")
            start_mcp_in_thread(port)
            return 0
        logger.exception("MCP server failed to start")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
