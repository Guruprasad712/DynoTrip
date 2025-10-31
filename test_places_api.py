"""
Standalone script to test Google Places API integration.

This script tests the same Places API endpoints used by the MCP agent,
allowing you to verify that:
1. API key is valid
2. Places API is enabled
3. Photos and reviews are being returned correctly

Usage:
    python test_places_api.py "Taj Mahal, India"
    python test_places_api.py "Eiffel Tower, Paris"
"""

import os
import sys
import json
import requests
from typing import Optional, Dict, Any

# Configuration - matches the implementation in agent.py
PLACES_BASE_URL = "https://places.googleapis.com/v1/places"

def get_api_key(cli_key: str = None) -> str:
    """Get API key from command line or environment."""
    if cli_key and cli_key.strip():
        return cli_key.strip()
        
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("Error: No API key provided")
        print("Please provide the API key as a command-line argument or set GOOGLE_MAPS_API_KEY environment variable")
        print("Example: python test_places_api.py \"Taj Mahal, India\" your_api_key_here")
        sys.exit(1)
    return api_key

def search_place(query: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Search for a place using the Places API."""
    url = f"{PLACES_BASE_URL}:searchText"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': 'places.id,places.name,places.displayName,places.formattedAddress',
    }
    payload = {
        "textQuery": query,
        "maxResultCount": 1,
        "languageCode": "en"
    }
    
    print(f"\n🔍 Searching for: {query}")
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        places = data.get('places', [])
        if not places:
            print("❌ No places found")
            return None
        return places[0]
    except Exception as e:
        print(f"❌ Search error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return None

def get_place_details(place_id: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Get detailed information about a place including photos and reviews."""
    url = f"{PLACES_BASE_URL}/{place_id}"
    headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': api_key,
        'X-Goog-FieldMask': ','.join([
            'id', 'displayName', 'formattedAddress', 'googleMapsUri',
            'rating', 'userRatingCount',
            'photos.name', 'photos.widthPx', 'photos.heightPx',
            'reviews.originalText.text', 'reviews.publishTime'
        ]),
    }
    
    print(f"\n📝 Fetching details for place ID: {place_id}")
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"❌ Details error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        return None

def format_photo_url(photo_name: str, api_key: str, max_width: int = 1200) -> str:
    """Generate a photo URL from a photo reference."""
    return f"https://places.googleapis.com/v1/{photo_name}/media?key={api_key}&maxWidthPx={max_width}"

def print_place_summary(place: Dict[str, Any], api_key: str):
    """Print a formatted summary of place details."""
    print("\n" + "="*50)
    print(f"🏛️  {place.get('displayName', {}).get('text', 'N/A')}")
    print(f"📍 {place.get('formattedAddress', 'N/A')}")
    
    if 'rating' in place:
        rating = place['rating']
        count = place.get('userRatingCount', 0)
        print(f"⭐ Rating: {rating:.1f}/5 ({count} reviews)")
    
    # Print photos
    photos = place.get('photos', [])
    if photos:
        print(f"\n📸 Photos ({len(photos)}):")
        for i, photo in enumerate(photos[:3], 1):  # Show up to 3 photos
            photo_url = format_photo_url(photo['name'], api_key)
            print(f"  {i}. {photo_url}")
    else:
        print("\n❌ No photos found")
    
    # Print reviews
    reviews = place.get('reviews', [])
    if reviews:
        print(f"\n💬 Reviews ({len(reviews)}):")
        for i, review in enumerate(reviews[:3], 1):  # Show up to 3 reviews
            text = (review.get('originalText', {}) or {}).get('text', 'No text')
            time = review.get('publishTime', 'Unknown date')
            print(f"  {i}. [{time}] {text[:150]}{'...' if len(text) > 150 else ''}")
    else:
        print("\n❌ No reviews found")
    
    print("="*50 + "\n")

def main():
    if len(sys.argv) < 2:
        print("Usage: python test_places_api.py \"Place Name, Location\" [api_key]")
        print("Example: python test_places_api.py \"Taj Mahal, India\" your_api_key_here")
        print("Or set GOOGLE_MAPS_API_KEY environment variable")
        sys.exit(1)
    
    query = sys.argv[1]
    api_key = sys.argv[2] if len(sys.argv) > 2 else None
    api_key = get_api_key(api_key)
    
    # Step 1: Search for the place
    place = search_place(query, api_key)
    if not place:
        print(f"❌ Could not find place: {query}")
        sys.exit(1)
    
    # Step 2: Get detailed information
    place_id = place.get('name', '').split('/')[-1]  # Extract ID from 'places/ChIJ...'
    if not place_id:
        print("❌ Could not extract place ID from response")
        sys.exit(1)
    
    details = get_place_details(place_id, api_key)
    if not details:
        print(f"❌ Could not get details for place ID: {place_id}")
        sys.exit(1)
    
    # Step 3: Print the results
    print("\n✅ Success! Here's what we found:")
    print_place_summary(details, api_key)
    
    # Save full response to file for inspection
    with open('places_api_response.json', 'w', encoding='utf-8') as f:
        json.dump(details, f, indent=2, ensure_ascii=False)
    print("💾 Full API response saved to: places_api_response.json")

if __name__ == "__main__":
    main()
