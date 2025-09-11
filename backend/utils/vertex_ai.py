
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
        The following JSON contains user preferences, travel options, and accommodation options that have been fetched from Firestore.
        Your task is to dynamically plan activities for each day, but for travel and accommodation, you must use ONLY the options provided in the JSON.
        Generate a day-by-day itinerary with activities, travel, and accommodation details. Return the result as a structured JSON matching the TripItinerary schema:

        {user_input}
        """
        response = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": TripItinerary,
            },
        )
        return response.parsed
