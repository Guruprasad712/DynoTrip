from google.cloud import aiplatform
import os
from dotenv import load_dotenv

class VertexAIClient:
    def __init__(self, project_id: str = None, location: str = "us-central1", model: str = None):
        """
        Initialize Vertex AI client.
        """
        load_dotenv()
        self.project_id = project_id or os.getenv("PROJECT_ID")
        self.location = location
        self.model = model or os.getenv("VERTEX_AI_MODEL", "gemini-1.5-flash")
        aiplatform.init(project=self.project_id, location=self.location)
    
    def generate_itinerary(self, user_input: dict) -> str:
        """
        Send user input JSON to Vertex AI Gemini and return generated itinerary as text.
        """
        prompt = f"""
        You are an AI travel assistant. 
        Based on the following input JSON, generate a day-by-day itinerary with activities, travel, and accommodation details:

        {user_input}
        """
        model = aiplatform.Model(self.model)
        response = model.predict(instances=[{"content": prompt}], parameters={"max_output_tokens": 500})
        # The response format may vary depending on the model and API version
        # Adjust parsing as needed for your model's output
        return response.predictions[0].get("content", "")
