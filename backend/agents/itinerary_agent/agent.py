from utils.firestore_client import get_travel_options, get_accommodation
from utils.vertex_ai import generate_itinerary

class ItineraryAgent:
    def __init__(self):
        # Initialize agent (can be extended later for caching or logging)
        pass

    def plan_trip(self, user_input: dict) -> str:
        """
        Plan a dynamic travel itinerary based on user preferences.
        """
        # Fetch travel options from Firestore
        travel_options = get_travel_options(
            user_input["from"],
            user_input["to"],
            user_input["Date"]["from"]
        )

        # Fetch accommodation options from Firestore
        accommodations = get_accommodation(user_input["to"])

        # Merge travel and accommodation data into user input
        user_input["travel_options"] = travel_options
        user_input["accommodation_options"] = accommodations

        # Generate itinerary using Vertex AI Gemini
        itinerary_text = generate_itinerary(user_input)

        return itinerary_text

