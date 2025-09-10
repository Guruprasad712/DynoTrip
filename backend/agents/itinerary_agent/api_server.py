from fastapi import FastAPI
from agents.itinerary_agent.agent import ItineraryAgent

app = FastAPI(title="Dynamic AI Trip Planner Agent")
agent = ItineraryAgent()

@app.post("/plan-trip")
async def plan_trip(user_input: dict):
    """
    Accepts a JSON input with user preferences and returns a generated itinerary.
    """
    itinerary = agent.plan_trip(user_input)
    return {"itinerary": itinerary}

