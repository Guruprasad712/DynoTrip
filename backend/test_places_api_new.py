import os
import json
import requests
from dotenv import load_dotenv
from typing import Dict, Any, List, Optional
from datetime import datetime

# Load environment variables
load_dotenv()

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"  # New Places API endpoint

def search_place(text_query: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Search for a place using the new Places API (New)"""
    url = f"{PLACES_BASE_URL}:searchText"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        # Request the minimal fields we need from search
        'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress,places.googleMapsUri',
    }
    
    data = {
        "textQuery": text_query,
        "maxResultCount": 1,
        "languageCode": "en"
    }
    
    try:
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()
        if 'places' in result and len(result['places']) > 0:
            return result['places'][0]
        return None
    except Exception as e:
        print(f"Error searching place: {str(e)}")
        return None

def get_place_details(place_id: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Get detailed information about a place using its ID"""
    url = f"{PLACES_BASE_URL}/{place_id}"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        # Fields on the Place resource to return
        'X-Goog-FieldMask': (
            'id,displayName,formattedAddress,rating,userRatingCount,priceLevel,photos,'
            'types,websiteUri,regularOpeningHours,currentOpeningHours,editorialSummary,'
            'primaryType,primaryTypeDisplayName,reviews,internationalPhoneNumber,'
            'nationalPhoneNumber,googleMapsUri'
        ),
    }
    
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error getting place details: {str(e)}")
        return None

def get_place_info(place_name: str, api_key: str) -> Dict[str, Any]:
    """
    Get place details including reviews, photos, and pricing from Google Places API (New).
    
    Args:
        place_name: Name of the place to search for
        api_key: Google Maps API key
        
    Returns:
        Dict containing place details
    """
    if not place_name:
        return {"error": "Place name cannot be empty"}
    
    try:
        # Search for the place
        place_data = search_place(place_name, api_key)
        if not place_data:
            return {"error": "Place not found or error in search"}
        
        # Get detailed information
        place_id = None
        if place_data.get('id'):
            place_id = place_data['id']
        else:
            name_field = place_data.get('name')  # e.g., "places/ChIJ..."
            if isinstance(name_field, str) and name_field.startswith('places/'):
                place_id = name_field.split('/', 1)[1]
        if not place_id:
            return {"error": "Could not extract place ID from search results"}
        
        details_data = get_place_details(place_id, api_key)
        if not details_data:
            return {"error": "Failed to get place details"}
        
        # Photos: return array of URLs (max 5)
        photo_urls: list[str] = []
        for photo in (details_data.get("photos") or [])[:5]:
            photo_name = photo.get("name")
            if photo_name:
                photo_urls.append(
                    f"https://places.googleapis.com/v1/{photo_name}/media?key={api_key}&maxWidthPx=800"
                )

        # Reviews: pick top 3 latest, only text and rating
        raw_reviews = details_data.get("reviews") or []
        def parse_time(rv):
            t = rv.get("publishTime")
            if isinstance(t, str):
                try:
                    return datetime.fromisoformat(t.replace('Z', '+00:00'))
                except Exception:
                    return datetime.min
            return datetime.min
        raw_reviews.sort(key=parse_time, reverse=True)
        top_reviews = []
        for rv in raw_reviews[:3]:
            top_reviews.append({
                "text": (rv.get("originalText") or {}).get("text"),
                "rating": rv.get("rating"),
            })

        # Prepare final minimal result
        place_details = {
            "rating": details_data.get("rating"),
            "total_ratings": details_data.get("userRatingCount"),
            "photos": photo_urls,
            "reviews": top_reviews,
        }
        
        return place_details
        
    except Exception as e:
        return {"error": f"An error occurred: {str(e)}"}

def check_places_api_status(api_key: str) -> bool:
    """Check if Places API is enabled and accessible"""
    url = f"https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4"  # Googleplex as test place
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'id',
    }
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return True
        print(f"API Error: {response.status_code} - {response.text}")
        return False
    except Exception as e:
        print(f"Connection error: {str(e)}")
        return False

if __name__ == "__main__":
    print(f"Using API key: {GOOGLE_MAPS_API_KEY[:10]}...{GOOGLE_MAPS_API_KEY[-4:] if GOOGLE_MAPS_API_KEY else 'None'}")
    
    if not GOOGLE_MAPS_API_KEY:
        print("Error: GOOGLE_MAPS_API_KEY not found in .env file")
    else:
        # Check if Places API is accessible
        print("Checking Places API access...")
        if not check_places_api_status(GOOGLE_MAPS_API_KEY):
            print("\nError: Could not access Google Places API. Please check:")
            print("1. Your API key is valid and has the Places API enabled")
            print("2. The Places API is enabled in your Google Cloud Console")
            print("3. Your billing account is active")
            exit(1)
        
        # Get place name from user
        place_name = ""  # You can set a default place here
        if not place_name:
            place_name = input("\nEnter a place to search (e.g., 'Taj Mahal, India'): ")
        
        print(f"\nSearching for: {place_name}")
        result = get_place_info(place_name, GOOGLE_MAPS_API_KEY)
        print("\nResults:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
