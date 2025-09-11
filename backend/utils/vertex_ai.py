
from google import genai
from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()

class DayPlan(BaseModel):
    day: int
    activities: list[str]
    travel: str
    accommodation: str

class TripItinerary(BaseModel):
    itinerary: list[DayPlan]

class VertexAIClient:
    def __init__(self, project_id: str = None, location: str = "us-central1", model: str = None):
        self.project_id = project_id or os.getenv("PROJECT_ID")
        self.location = location
        self.model = model or os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")
        self.client = genai.Client(vertexai=True, project=self.project_id, location=self.location)

    def generate_itinerary(self, user_input: dict) -> TripItinerary:
        prompt = f"""
            You are an AI travel assistant.
            The following JSON contains user preferences, and lists of available travel and accommodation options fetched from Firestore.
            For each day, select travel and accommodation ONLY from the provided lists. Do not invent new options.
            Dynamically plan activities for each day. Return the result as a structured JSON matching the TripItinerary schema.
            User Input and Options:
            {user_input}
        """
        print(f"/n/n{prompt}/n/n")
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": TripItinerary,
            },
        )
        return response.parsed
