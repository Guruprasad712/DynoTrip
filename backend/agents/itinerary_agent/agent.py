from utils.firestore_client import FirestoreClient
from utils.vertex_ai import VertexAIClient

class ItineraryAgent:
    def __init__(self, firestore_client: FirestoreClient, vertex_client: VertexAIClient):
        self.firestore_client = firestore_client
        self.vertex_client = vertex_client

    def plan_trip(self, user_input: dict) -> str:
        """
        Plan a dynamic travel itinerary based on user preferences.
        """
        # Fetch travel options from Firestore
        travel_options = self.firestore_client.get_travel_options(
            user_input["from"],
            user_input["to"],
            user_input["Date"]["from"]
        )

        # Fetch accommodation options from Firestore
        accommodations = self.firestore_client.get_accommodation(user_input["to"])

        # Merge travel and accommodation data into user input
        user_input["travel_options"] = travel_options
        user_input["accommodation_options"] = accommodations

        # Generate itinerary using Vertex AI Gemini
        itinerary_text = self.vertex_client.generate_itinerary(user_input)

        return itinerary_text

