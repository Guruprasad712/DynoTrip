from google import genai
from pydantic import BaseModel
from dotenv import load_dotenv
import os

load_dotenv()


class Recipe(BaseModel):
    recipe_name: str
    ingredients: list[str]

project_id=os.getenv("PROJECT_ID")
location="us-central1"
client = genai.Client(vertexai=True, project=project_id, location=location)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="List a few popular cookie recipes, and include the amounts of ingredients.",
    config={
        "response_mime_type": "application/json",
        "response_schema": list[Recipe],
    },
)
# Use the response as a JSON string.
print(response.text)

# Use instantiated objects.
my_recipes: list[Recipe] = response.parsed