import os
import json
from typing import Any, Dict, Optional
from dotenv import load_dotenv
from fastmcp import Client

try:
    from fastmcp.client.transports import StreamableHttpTransport  # type: ignore
except Exception:
    StreamableHttpTransport = None  # type: ignore

from google import genai
import requests
from datetime import datetime, timedelta

load_dotenv()

# quiet noisy logs
import logging
logging.getLogger("google.genai").setLevel(logging.ERROR)
logging.getLogger("fastmcp").setLevel(logging.ERROR)

# Create a reusable MCP client (HTTP preferred)
def get_mcp_client() -> Client:
    """Get a configured MCP client.
    
    Raises:
        RuntimeError: If MCP_SERVER_URL is not set or client cannot be created
    """
    mcp_url = os.getenv("MCP_SERVER_URL")
    if not mcp_url:
        raise RuntimeError("MCP_SERVER_URL environment variable is not set")
    
    if StreamableHttpTransport is None:
        raise RuntimeError("StreamableHttpTransport is not available")
    
    try:
        transport = StreamableHttpTransport(url=mcp_url)
        return Client(transport=transport)
    except Exception as e:
        raise RuntimeError(f"Failed to create MCP client: {str(e)}")

# Create a reusable Gemini client
# Prefer API key when available; otherwise fall back to Vertex AI (ADC)
_MODEL = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")
_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VERTEX_API_KEY")
if _API_KEY:
    _gemini_client = genai.Client(api_key=_API_KEY)
else:
    _gemini_client = genai.Client(
        vertexai=True,
        project=os.getenv("PROJECT_ID"),
        location=os.getenv("VERTEX_AI_LOCATION", "us-central1"),
    )


def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return "{}"


def extract_all_text(resp) -> str:
    try:
        texts = []
        candidates = getattr(resp, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            if parts:
                for p in parts:
                    t = getattr(p, "text", None)
                    if t:
                        texts.append(t)
        if texts:
            return "".join(texts)
    except Exception:
        pass
    # Ensure we always return a string, even if resp.text is None or non-string
    try:
        fallback = getattr(resp, "text", "")
    except Exception:
        fallback = ""
    return fallback if isinstance(fallback, str) else str(fallback)


def parse_json_response(resp) -> Dict[str, Any]:
    # Try parsed schema first if available
    if getattr(resp, "parsed", None) is not None:
        try:
            return json.loads(json.dumps(resp.parsed))
        except Exception:
            pass
    # Fallback: extract text and parse JSON object
    text = extract_all_text(resp)
    if not isinstance(text, str):
        text = str(text or "")
    stripped = text.strip()
    if not stripped:
        raise ValueError("LLM returned empty response text")
    start = stripped.find('{')
    end = stripped.rfind('}')
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(stripped[start:end+1])
        except Exception as e:
            raise ValueError(f"LLM returned non-JSON or malformed JSON object: {str(e)} | Snippet: {stripped[:200]}")
    # As last resort, try direct json
    try:
        return json.loads(stripped)
    except Exception as e:
        raise ValueError(f"LLM returned non-JSON content: {str(e)} | Snippet: {stripped[:200]}")


def llm_json_with_tools(prompt: str, response_schema: Any = None, timeout: int = 300) -> Dict[str, Any]:
    mcp_client = get_mcp_client()
    if mcp_client is None:
        # If MCP server not reachable, raise explicit error (endpoints require tools)
        raise RuntimeError("MCP server not available. Ensure agents/itinerary_agent/utils/agent.py is running and MCP_SERVER_URL is set.")

    async def _run():
        async with mcp_client:
            cfg = genai.types.GenerateContentConfig(
                tools=[mcp_client.session],
                response_mime_type="application/json",
            )
            if response_schema is not None:
                cfg.response_schema = response_schema
            resp = await _gemini_client.aio.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=cfg,
            )
            return parse_json_response(resp)

    import asyncio
    return asyncio.get_event_loop().run_until_complete(asyncio.wait_for(_run(), timeout=timeout))


def geocode_place(address: str, api_key: str | None = None) -> Optional[Dict[str, float]]:
    """Resolve a freeform address/place name to a (lat, lon) dict using Google Geocoding API.
    Returns {'lat': float, 'lng': float} or None on failure.
    """
    if api_key is None:
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key or not address:
        return None
    try:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        resp = requests.get(url, params={"address": address, "key": api_key}, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        results = data.get('results') or []
        if not results:
            return None
        loc = results[0].get('geometry', {}).get('location')
        if not loc:
            return None
        return {"lat": float(loc.get('lat')), "lng": float(loc.get('lng'))}
    except Exception:
        return None


def get_hourly_weather_summary(lat: float, lng: float, days: int = 3, api_key: str | None = None) -> Dict[str, Any]:
    """Fetch a short daily weather summary for the next `days` days using the Google Weather Hours lookup.
    Returns a dict keyed by ISO date (YYYY-MM-DD) with simple summary strings like 'Rainy', 'Sunny'.
    This is intentionally simple: picks the most frequent condition label in the day's hours.
    """
    if api_key is None:
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return {}
    summaries: Dict[str, Any] = {}
    try:
        url = "https://weather.googleapis.com/v1/forecast/hours:lookup"
        params = {"key": api_key, "location.latitude": lat, "location.longitude": lng}
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        hours = data.get('hours') or []
        buckets: Dict[str, list] = {}
        now = datetime.utcnow()
        for h in hours:
            ts = h.get('time') or h.get('startTime') or h.get('datetime')
            try:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
            except Exception:
                continue
            date_key = dt.date().isoformat()
            if (dt.date() - now.date()).days >= days:
                continue
            buckets.setdefault(date_key, []).append(h)

        for i in range(days):
            d = (now + timedelta(days=i)).date().isoformat()
            day_hours = buckets.get(d, [])
            if not day_hours:
                summaries[d] = {'summary': 'Unknown', 'detail': None}
                continue
            cond_counts: Dict[str, int] = {}
            temps: list = []
            for h in day_hours:
                cond = (h.get('condition') or {}).get('code') or (h.get('condition') or {}).get('text') or 'Unknown'
                cond_counts[cond] = cond_counts.get(cond, 0) + 1
                temp = h.get('temperature') or (h.get('temperatureC') if 'temperatureC' in h else None)
                if temp is not None:
                    try:
                        temps.append(float(temp))
                    except Exception:
                        pass
            most = max(cond_counts.items(), key=lambda x: x[1])[0] if cond_counts else 'Unknown'
            avg_temp = (sum(temps)/len(temps)) if temps else None
            summaries[d] = {
                'summary': most,
                'avg_temp': round(avg_temp,1) if avg_temp is not None else None,
                'detail_count': len(day_hours),
            }
    except Exception:
        return {}
    return summaries
