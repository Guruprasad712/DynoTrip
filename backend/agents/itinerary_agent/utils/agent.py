import asyncio
import json
import os
import time
import aiohttp
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from functools import wraps, lru_cache
from pydantic import BaseModel, Field
from fastmcp import FastMCP
from firestore_client import FirestoreClient
from dotenv import load_dotenv
from ratelimit import limits, sleep_and_retry
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryCallState
)

load_dotenv()

# Initialize FastMCP
mcp = FastMCP(name="Travel MCP Server")

# Initialize shared clients
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

# Global HTTP session for connection pooling
session = None

# In-memory cache
class SimpleCache:
    def __init__(self):
        self._cache = {}
        self._expiry = {}
    
    async def get(self, key: str) -> Optional[Any]:
        if key in self._expiry and self._expiry[key] < time.time():
            self._cache.pop(key, None)
            self._expiry.pop(key, None)
            return None
        return self._cache.get(key)
    
    async def set(self, key: str, value: Any, ex: int = None):
        self._cache[key] = value
        if ex is not None:
            self._expiry[key] = time.time() + ex

# Initialize in-memory cache
cache = SimpleCache()

# Constants
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
WEATHER_URL = "https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/"
CACHE_TTL = 3600  # 1 hour
RATE_LIMIT = 50  # requests per minute
CONCURRENT_REQUESTS = 10  # Max concurrent requests

# Request model for batching
class PlaceSearchRequest(BaseModel):
    text_query: str
    session: aiohttp.ClientSession
    result: dict = Field(default_factory=dict)
    future: asyncio.Future = None

class PlaceDetailsRequest(BaseModel):
    place_id: str
    session: aiohttp.ClientSession
    result: dict = Field(default_factory=dict)
    future: asyncio.Future = None

# Rate limiting
RATE_LIMIT_PER_MINUTE = 50
RATE_LIMIT_PER_DAY = 5000

class RateLimitExceeded(Exception):
    pass

def rate_limited(calls: int, period: int = 60):
    """Decorator to limit the number of calls to a function per time period."""
    def decorator(f):
        calls_count = 0
        last_reset = time.time()
        
        @wraps(f)
        async def wrapper(*args, **kwargs):
            nonlocal calls_count, last_reset
            
            # Reset counter if period has passed
            if time.time() - last_reset > period:
                calls_count = 0
                last_reset = time.time()
                
            # Check rate limit
            if calls_count >= calls:
                sleep_time = period - (time.time() - last_reset)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                calls_count = 0
                last_reset = time.time()
                
            calls_count += 1
            return await f(*args, **kwargs)
            
        return wrapper
    return decorator

# Async HTTP session management
async def get_session() -> aiohttp.ClientSession:
    global session
    if session is None or session.closed:
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        connector = aiohttp.TCPConnector(
            limit_per_host=CONCURRENT_REQUESTS,
            ttl_dns_cache=300,
            enable_cleanup_closed=True,
            force_close=False
        )
        session = aiohttp.ClientSession(
            timeout=timeout,
            connector=connector,
            json_serialize=json.dumps,
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'DynoTrip/1.0',
            }
        )
    return session

@mcp.tool
def get_travel_options(frm: str, to: str, depart_date: str | None = None):
    """Fetch travel options from Firestore, honoring depart_date when provided."""
    return firestore_client.get_travel_options(frm, to, depart_date)

@mcp.tool
def get_accommodation(city: str):
    """Fetch accommodation options from Firestore."""
    return firestore_client.get_accommodation(city)

# ---- Places API (New) helper functions ----
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"

# Cache management
async def get_cache(key: str) -> Optional[Any]:
    """Get value from cache (Redis if available, otherwise in-memory)."""
    if not key:
        return None
        
    if redis_client:
        try:
            cached = await redis_client.get(f"dynotrip:{key}")
            return json.loads(cached) if cached else None
        except Exception as e:
            print(f"Cache get error: {e}")
            return None
    return None

async def set_cache(key: str, value: Any, ttl: int = CACHE_TTL) -> None:
    """Set value in cache with TTL."""
    if not key or value is None:
        return
        
    if redis_client:
        try:
            await redis_client.set(
                f"dynotrip:{key}",
                json.dumps(value, default=str),
                ex=ttl
            )
        except Exception as e:
            print(f"Cache set error: {e}")

# Rate limited and cached API calls
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError)),
    reraise=True
)
async def _places_search_async(text_query: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    """Async implementation of places search with caching and retries."""
    cache_key = f"places:search:{text_query.lower().strip()}"
    if cached := await get_cache(cache_key):
        return cached

    url = f"{PLACES_BASE_URL}:searchText"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress,places.googleMapsUri',
    }
    
    try:
        async with session.post(
            url,
            headers=headers,
            json={"textQuery": text_query, "maxResultCount": 1, "languageCode": "en"}
        ) as resp:
            resp.raise_for_status()
            data = await resp.json()
            result = (data.get('places') or [None])[0]
            if result:
                await set_cache(cache_key, result)
            return result
    except aiohttp.ClientError as e:
        print(f"Places search failed: {e}")
        raise

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((aiohttp.ClientError, asyncio.TimeoutError)),
    reraise=True
)
async def _places_details_async(place_id: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    """Async implementation of places details with caching and retries."""
    cache_key = f"places:details:{place_id}"
    if cached := await get_cache(cache_key):
        return cached

    url = f"{PLACES_BASE_URL}/{place_id}"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'rating,userRatingCount,photos,reviews',
    }
    
    try:
        async with session.get(url, headers=headers) as resp:
            resp.raise_for_status()
            result = await resp.json()
            await set_cache(cache_key, result)
            return result
    except aiohttp.ClientError as e:
        print(f"Places details failed: {e}")
        raise

async def _geocode_address_async(address: str, api_key: str, session: aiohttp.ClientSession) -> Optional[dict]:
    """Async geocoding with caching and retries."""
    if not address:
        return None
        
    cache_key = f"geocode:{address.lower().strip()}"
    if cached := await get_cache(cache_key):
        return cached
    
    params = {
        'address': address,
        'key': api_key,
        'language': 'en',
        'region': 'us',
    }
    
    try:
        async with session.get(GEOCODE_URL, params=params) as resp:
            resp.raise_for_status()
            data = await resp.json()
            
            if results := data.get('results'):
                loc = results[0].get('geometry', {}).get('location')
                if loc:
                    result = {"lat": float(loc.get('lat', 0)), "lng": float(loc.get('lng', 0))}
                    await set_cache(cache_key, result)
                    return result
    except Exception as e:
        print(f"Geocoding failed: {e}")
        
    return None

async def _fetch_weather_summary_async(lat: float, lng: float, days: int = 3, api_key: str = None) -> dict:
    """Async weather fetching with caching."""
    if not api_key:
        api_key = os.getenv('WEATHER_API_KEY')
    if not api_key:
        return {}
        
    cache_key = f"weather:{lat:.4f},{lng:.4f}:{days}"
    if cached := await get_cache(cache_key):
        return cached
        
    params = {
        'key': api_key,
        'unitGroup': 'metric',
        'include': 'days',
        'elements': 'temp,conditions',
        'contentType': 'json',
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{WEATHER_URL}/{lat},{lng}/next{days}days"
            async with session.get(url, params=params) as resp:
                resp.raise_for_status()
                data = await resp.json()
                
                if 'days' in data:
                    result = {
                        day['datetime']: {
                            'summary': day.get('conditions', 'Unknown'),
                            'avg_temp': day.get('temp'),
                            'temp_min': day.get('tempmin'),
                            'temp_max': day.get('tempmax'),
                        }
                        for day in data['days']
                    }
                    await set_cache(cache_key, result, ttl=3600)  # Cache for 1 hour
                    return result
    except Exception as e:
        print(f"Weather API error: {e}")
        
    return {}

@mcp.tool
async def place_details_async(query: str) -> dict:
    """
    Async version of place_details with better performance.
    Fetch place details via Google Places API (New).
    Returns: { rating, total_ratings, photos: [url...], reviews: [text...] }
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return {"error": "GOOGLE_MAPS_API_KEY not configured"}
    if not query:
        return {"error": "query cannot be empty"}
    
    session = await get_session()
    
    try:
        # Search for the place
        found = await _places_search_async(query, api_key, session)
        if not found:
            return {"error": "Place not found"}
        
        # Extract place ID
        place_id = found.get('id')
        if not place_id:
            name_field = found.get('name', '')
            if isinstance(name_field, str) and name_field.startswith('places/'):
                place_id = name_field.split('/', 1)[1]
        
        if not place_id:
            return {"error": "Could not extract place ID"}
        
        # Get place details
        details = await _places_details_async(place_id, api_key, session)
        if not details:
            return {"error": "Could not fetch place details"}
        
        # Prepare photos (up to 3)
        photos = []
        photo_objects = details.get('photos', [])
        
        # Process photos concurrently
        photo_tasks = []
        for i, p in enumerate(photo_objects[:3], 1):
            pname = p.get('name')
            if pname:
                # Extract the photo reference properly
                photo_ref = pname.split('/')[-1]  # Get just the photo reference part
                photo_url = f"https://places.googleapis.com/v1/places/{place_id}/photos/{photo_ref}/media?key={api_key}&maxWidthPx=600"
                photos.append(photo_url)
                
                # Add a small delay between photo requests to avoid rate limiting
                if i < len(photo_objects[:3]) and i < 3:  # Max 3 photos
                    await asyncio.sleep(0.1)  # 100ms delay between requests
        
        # Get reviews (up to 3)
        reviews = []
        for review in details.get('reviews', [])[:3]:
            if text := review.get('text'):
                reviews.append(text.strip())
        
        # Get rating and total ratings
        rating = details.get('rating')
        if rating is not None:
            try:
                rating = float(rating)
            except (TypeError, ValueError):
                rating = None
        
        total_ratings = details.get('userRatingCount')
        if total_ratings is not None:
            try:
                total_ratings = int(total_ratings)
            except (TypeError, ValueError):
                total_ratings = 0
        
        # Get address
        address = found.get('formattedAddress') or found.get('address', '')
        
        # Get website and phone if available
        website = found.get('websiteUri')
        phone = found.get('nationalPhoneNumber')
        
        # Get opening hours if available
        opening_hours = found.get('regularOpeningHours', {})
        
        return {
            'name': found.get('displayName', {}).get('text', query),
            'address': address,
            'rating': rating,
            'total_ratings': total_ratings,
            'photos': photos,
            'reviews': reviews,
            'website': website,
            'phone': phone,
            'opening_hours': opening_hours,
            'google_maps_url': found.get('googleMapsUri')
        }
        
    except Exception as e:
        print(f"Error in place_details_async: {e}")
        return {"error": f"Failed to fetch place details: {str(e)}"}
    finally:
        # Don't close the session here as it's managed by the application
        pass

@mcp.tool
def place_details(query: str) -> dict:
    """
    Synchronous wrapper for place_details_async.
    Fetch place details via Google Places API (New).
    Returns: { rating, total_ratings, photos: [url...], reviews: [text...] }
    """
    try:
        # Run the async function in the current event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If there's already a running event loop, create a new one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(place_details_async(query))
            loop.close()
            return result
        else:
            return loop.run_until_complete(place_details_async(query))
    except Exception as e:
        print(f"Error in place_details: {e}")
        return {"error": f"Failed to fetch place details: {str(e)}"}

# Update the tool registration to use the async version
mcp.tool(place_details_async, name="place_details_async")

# Add a batch version of place details
@mcp.tool
async def batch_place_details(queries: List[str]) -> Dict[str, dict]:
    """
    Fetch details for multiple places concurrently.
    Returns: {query1: details1, query2: details2, ...}
    """
    if not queries:
        return {}
        
    # Deduplicate queries while preserving order
    unique_queries = []
    seen = set()
    for q in queries:
        if q and q not in seen:
            seen.add(q)
            unique_queries.append(q)
    
    # Process up to 10 queries at a time
    results = {}
    batch_size = 10
    
    for i in range(0, len(unique_queries), batch_size):
        batch = unique_queries[i:i + batch_size]
        tasks = [place_details_async(q) for q in batch]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for query, result in zip(batch, batch_results):
            if isinstance(result, Exception):
                print(f"Error processing {query}: {result}")
                results[query] = {"error": str(result)}
            else:
                results[query] = result
        
        # Add a small delay between batches
        if i + batch_size < len(unique_queries):
            await asyncio.sleep(0.5)
    
    return results
                    time.sleep(0.1)
        # Reviews (top 3 latest, text only)
        def _parse_time(rv):
            t = rv.get('publishTime')
            if isinstance(t, str):
                try:
                    return datetime.fromisoformat(t.replace('Z', '+00:00'))
                except Exception:
                    return datetime.min
            return datetime.min
        revs = sorted(details.get('reviews') or [], key=_parse_time, reverse=True)[:2]
        review_texts = [(rv.get('originalText') or {}).get('text') for rv in revs]

        rating_val = details.get('rating')
        total = details.get('userRatingCount')
        rating_str = None
        try:
            if rating_val is not None and total is not None:
                rating_str = f"{float(rating_val):.1f} ({int(total)})"
        except Exception:
            rating_str = None

        return {
            "rating": rating_val,
            "total_ratings": total,
            "rating_str": rating_str,
            "photos": photos,
            "reviews": [t for t in review_texts if t],
        }
    except requests.HTTPError as e:
        try:
            return {"error": f"HTTP {e.response.status_code}", "details": e.response.json()}
        except Exception:
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

    # Attempt to add a compact weather summary (if API key and address available)
    try:
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
        addr = (found.get('formattedAddress') or found.get('displayName') or query)
        if api_key and addr:
            geo = _geocode_address(addr, api_key)
            if geo:
                weather = _fetch_weather_summary(geo['lat'], geo['lng'], days=3, api_key=api_key)
                if weather:
                    # attach under 'weather'
                    return {**{
                        "rating": rating_val,
                        "total_ratings": total,
                        "rating_str": rating_str,
                        "photos": photos,
                        "reviews": [t for t in review_texts if t],
                    }, "weather": weather}
    except Exception:
        pass

    return {
        "rating": rating_val,
        "total_ratings": total,
        "rating_str": rating_str,
        "photos": photos,
        "reviews": [t for t in review_texts if t],
    }

# NOTE: The previous Routes / compute_route tool has been removed per project decision.
# The LLM prompts should now request the model to consider travel times and produce a
# route-aware ordering itself. If a route optimizer is required later, reintroduce a
# separate, well-specified tool here.

if __name__ == "__main__":
    # Cloud Run: listen on 0.0.0.0 and PORT (default 8080)
    port = int(os.getenv("PORT", "8080"))
    mcp.run(transport="http", host="0.0.0.0", port=port)
