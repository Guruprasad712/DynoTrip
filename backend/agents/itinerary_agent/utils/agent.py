from fastmcp import FastMCP
from firestore_client import FirestoreClient
import os
import requests
from datetime import datetime

# Prefer built-in stateless HTTP mode if available in this fastmcp version
mcp = FastMCP(name="Travel MCP Server")


# Initialize shared clients
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))

@mcp.tool
def get_travel_options(frm: str, to: str, depart_date: str | None = None):
    """Fetch travel options from Firestore."""
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
    resp = requests.post(url, headers=headers, json=payload, timeout=20)
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
        'X-Goog-FieldMask': 'rating,userRatingCount,photos,reviews',
    }
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    if PLACES_DEBUG:
        photos_count = len(data.get('photos') or [])
        reviews_count = len(data.get('reviews') or [])
        print(f"[places] details {place_id}: photos={photos_count}, reviews={reviews_count}")
    _details_cache[place_id] = data
    return data

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
        # Photos (up to 5)
        photos = []
        for p in (details.get('photos') or [])[:5]:
            pname = p.get('name')
            if pname:
                photos.append(f"https://places.googleapis.com/v1/{pname}/media?key={api_key}&maxWidthPx=800")
        # Reviews (top 3 latest, text only)
        def _parse_time(rv):
            t = rv.get('publishTime')
            if isinstance(t, str):
                try:
                    return datetime.fromisoformat(t.replace('Z', '+00:00'))
                except Exception:
                    return datetime.min
            return datetime.min
        revs = sorted(details.get('reviews') or [], key=_parse_time, reverse=True)[:3]
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

if __name__ == "__main__":
   
    #import asyncio

    #asyncio.run(mcp.run_async())
    mcp.run(transport="http", host="127.0.0.1", port=9000)
