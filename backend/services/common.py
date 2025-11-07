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
    """Get a configured MCP client with proper headers.
    
    Returns:
        Client: Configured MCP client with proper headers
        
    Raises:
        RuntimeError: If MCP_SERVER_URL is not set or client cannot be created
    """
    mcp_url = os.getenv("MCP_SERVER_URL")
    if not mcp_url:
        raise RuntimeError("MCP_SERVER_URL environment variable is not set")
    
    if StreamableHttpTransport is None:
        raise RuntimeError("StreamableHttpTransport is not available")
    
    try:
        # Create transport with proper headers
        transport = StreamableHttpTransport(
            url=mcp_url,
            headers={
                "Accept": "text/event-stream",
                "Content-Type": "application/json"
            }
        )
        return Client(transport=transport)
    except Exception as e:
        raise RuntimeError(f"Failed to create MCP client: {str(e)}")

# Create a reusable Gemini client
# The client gets the API key from the environment variable `GEMINI_API_KEY`
_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
_gemini_client = genai.Client()  # API key is automatically read from GEMINI_API_KEY environment variable


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
        resp = requests.get(url, params={"address": address, "key": api_key}, timeout=8)
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

    # Helper: robust ISO parsing (accepts 'Z', fractional seconds, or missing timezone)
    def _parse_ts(ts_val: Any) -> Optional[datetime]:
      if not ts_val:
        return None
      s = str(ts_val)
      try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
      except Exception:
        try:
          # drop fractional seconds if present
          base = s.split('.')[0]
          if base.endswith('Z'):
            base = base.replace('Z', '+00:00')
          return datetime.fromisoformat(base)
        except Exception:
          return None

    summaries: Dict[str, Any] = {}
    try:
      url = "https://weather.googleapis.com/v1/forecast/hours:lookup"
      params = {
        "key": api_key,
        "location.latitude": lat,
        "location.longitude": lng,
        # Hint metric units where supported (harmless if ignored)
        "units": "metric",
      }
      resp = requests.get(url, params=params, timeout=10)
      resp.raise_for_status()
      data = resp.json() or {}

      # Some responses might nest differently; prefer 'hours', else try alternative common keys
      hours = data.get('hours')
      if not isinstance(hours, list):
        # try alternative shapes commonly seen
        hours = (data.get('hourly') or {}).get('hours') or data.get('forecasts') or []
        if not isinstance(hours, list):
          hours = []

      # Bucket hours by day for next N days starting from now (UTC)
      buckets: Dict[str, list] = {}
      now = datetime.utcnow()
      for h in hours:
        ts = h.get('time') or h.get('startTime') or h.get('datetime')
        dt = _parse_ts(ts)
        if dt is None:
          continue
        # Only include hours within the requested horizon
        delta_days = (dt.date() - now.date()).days
        if delta_days < 0 or delta_days >= max(1, int(days)):
          continue
        date_key = dt.date().isoformat()
        buckets.setdefault(date_key, []).append(h)

      # Build daily summaries
      for i in range(max(1, int(days))):
        d = (now + timedelta(days=i)).date().isoformat()
        day_hours = buckets.get(d, [])
        if not day_hours:
          summaries[d] = {"summary": "Unknown", "avg_temp": None, "detail_count": 0}
          continue
        cond_counts: Dict[str, int] = {}
        temps: list = []
        for h in day_hours:
          cond_obj = h.get('condition') or {}
          cond = (
            cond_obj.get('text')
            or cond_obj.get('code')
            or h.get('weather_text')
            or h.get('weatherCode')
            or 'Unknown'
          )
          cond_counts[str(cond)] = cond_counts.get(str(cond), 0) + 1
          temp = (
            h.get('temperature')
            or h.get('temperatureC')
            or h.get('temp_c')
            or h.get('temperature_2m')
          )
          if temp is not None:
            try:
              temps.append(float(temp))
            except Exception:
              pass
        most = max(cond_counts.items(), key=lambda x: x[1])[0] if cond_counts else 'Unknown'
        avg_temp = (sum(temps) / len(temps)) if temps else None
        summaries[d] = {
          'summary': 'Unknown' if most is None else str(most),
          'avg_temp': round(avg_temp, 1) if avg_temp is not None else None,
          'detail_count': len(day_hours),
        }
    except Exception:
      return {}
    return summaries
