from agents.itinerary_agent.agent import ItineraryAgent
from utils.firestore_client import FirestoreClient
from utils.vertex_ai import VertexAIClient
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize FirestoreClient and VertexAIClient
firestore_client = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
vertex_client = VertexAIClient()

# Initialize the ItineraryAgent with required clients
agent = ItineraryAgent(firestore_client, vertex_client)

# Sample user input JSON
user_input = {
    "from": "Chennai",
    "to": "Pondicherry",
    "Date": {"from": "2025-09-19", "to": "2025-09-21"},
    "group_type": "Family",
    "activities": ["NightLife", "Devotion", "Adventure"]
}

# Generate itinerary using the agent
itinerary = agent.plan_trip(user_input)

# Print output
print("Generated Itinerary:\n")
print(itinerary)
