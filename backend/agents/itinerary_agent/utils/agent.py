from fastmcp import FastMCP
from firestore_client import FirestoreClient
import os
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv 

load_dotenv()

# Prefer built-in stateless HTTP mode if available in this fastmcp version
mcp = FastMCP(name="Travel MCP Server")


# Initialize shared clients
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

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

# In-memory caches (per-process) to avoid repeated external calls during a single plan generation
_search_cache: dict[str, dict] = {}
_details_cache: dict[str, dict] = {}
PLACES_DEBUG = os.getenv("PLACES_DEBUG", "0") == "1"

def _places_search(text_query: str, api_key: str):
    if text_query in _search_cache:
        if PLACES_DEBUG:
            print(f"[places] cache hit search: {text_query}")
        return _search_cache[text_query]
    url = f"{PLACES_BASE_URL}:searchText"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress,places.googleMapsUri',
    }
    payload = {"textQuery": text_query, "maxResultCount": 1, "languageCode": "en"}
    resp = requests.post(url, headers=headers, json=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    places = data.get('places') or []
    result = places[0] if places else None
    if PLACES_DEBUG:
        print(f"[places] search '{text_query}' -> found={bool(result)}")
    if result is not None:
        _search_cache[text_query] = result
    return result

def _places_details(place_id: str, api_key: str):
    if place_id in _details_cache:
        if PLACES_DEBUG:
            print(f"[places] cache hit details: {place_id}")
        return _details_cache[place_id]
    url = f"{PLACES_BASE_URL}/{place_id}"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        # Only fetch what we actually use
        # Explicitly request photo names so we can build media URLs
        'X-Goog-FieldMask': 'rating,userRatingCount,photos.name,photos.widthPx,photos.heightPx,reviews.originalText.text,reviews.publishTime',
    }
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    if PLACES_DEBUG:
        photos_count = len(data.get('photos') or [])
        reviews_count = len(data.get('reviews') or [])
        print(f"[places] details {place_id}: photos={photos_count}, reviews={reviews_count}")
    _details_cache[place_id] = data
    return data


# ---- Minimal geocode + weather helpers (used by place_details) ----
def _geocode_address(address: str, api_key: str, timeout: int = 8):
    """Return {'lat': float, 'lng': float} or None"""
    if not address:
        return None
    try:
        url = "https://maps.googleapis.com/maps/api/geocode/json"
        resp = requests.get(url, params={"address": address, "key": api_key}, timeout=timeout)
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


def _fetch_weather_summary(lat: float, lng: float, days: int = 3, api_key: str | None = None):
    """Return a compact dict of per-day weather summaries or None on failure."""
    if api_key is None:
        api_key = os.getenv('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return None
    try:
        url = "https://weather.googleapis.com/v1/forecast/hours:lookup"
        params = {"key": api_key, "location.latitude": lat, "location.longitude": lng}
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        hours = data.get('hours') or []
        buckets = {}
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

        summaries = {}
        for i in range(days):
            d = (now + timedelta(days=i)).date().isoformat()
            day_hours = buckets.get(d, [])
            if not day_hours:
                summaries[d] = {'summary': 'Unknown', 'avg_temp': None}
                continue
            cond_counts = {}
            temps = []
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
            avg_temp = (sum(temps) / len(temps)) if temps else None
            summaries[d] = {'summary': most, 'avg_temp': round(avg_temp, 1) if avg_temp is not None else None}
        return summaries
    except Exception:
        return None

@mcp.tool
def place_details(query: str) -> dict:
    """
    Fetch place details via Google Places API (New).
    Returns: { rating, total_ratings, photos: [url...], reviews: [text...] }
    """
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        return {"error": "GOOGLE_MAPS_API_KEY not configured"}
    if not query:
        return {"error": "query cannot be empty"}
    try:
        if PLACES_DEBUG:
            print(f"[places] QUERY: {query}")
        found = _places_search(query, api_key)
        if not found:
            return {"error": "Place not found"}
        # Extract place ID
        place_id = found.get('id')
        if not place_id:
            name_field = found.get('name')
            if isinstance(name_field, str) and name_field.startswith('places/'):
                place_id = name_field.split('/', 1)[1]
        if not place_id:
            return {"error": "Could not extract place ID"}

        details = _places_details(place_id, api_key)
        # Photos (up to 3)
        photos = []
        for p in (details.get('photos') or [])[:3]:
            pname = p.get('name')
            if pname:
                photos.append(f"https://places.googleapis.com/v1/{pname}/media?key={api_key}&maxWidthPx=600")
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
