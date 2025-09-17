import os
from typing import Any, Dict
from .common import get_mcp_client, _MODEL, _gemini_client, read_file, parse_json_response
from google import genai

TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "templates",
    "output_jsons",
    "generated_itinerary.json",
)

async def generate_itinerary_from_selections(input_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate itinerary using ONLY MCP tools for places and route optimizer.
    Should consider available travel and stay information included in input_json.
    Expects `input_json` matching templates/input_jsons/input_selections.json.
    """
    template_json = read_file(TEMPLATE_PATH)
    mcp_client = get_mcp_client()
    if mcp_client is None:
        raise RuntimeError("MCP server not available. Please run agents/itinerary_agent/utils/agent.py and set MCP_SERVER_URL.")

    parts = []
    parts.append("You are an AI itinerary planner.\n")
    parts.append("Use ONLY these MCP tools: place_details(query) and compute_route(origin, destination, intermediates).\n")
    parts.append("Do NOT call any other tools.\n")
    parts.append("Input structure: top-level contains user preferences (departure, destination, startDate, endDate, members, activities, tripTheme, budget, specialInstructions).\n")
    parts.append("Input also contains selections under 'selections' with chosen travel and accommodation.\n")
    parts.append("Strict rule: Use ONLY the provided travel and accommodation from input.selections. Do NOT invent or replace them.\n")
    parts.append("Align the entire plan with user preferences (dates, party size, theme, activities, budget) from top-level fields.\n")
    parts.append("Accommodation handling (two modes):\n")
    parts.append("- If selections.hotelsSelection.useSameHotel == true, use selections.hotelsSelection.booking for the whole stay (check-in/check-out).\n")
    parts.append("- If selections.hotelsSelection.useSameHotel == false, respect selections.hotelsSelection.bookingPerDay (array of {day, date, hotelId, name, pricePerNight}).\n")
    parts.append("- Do NOT add hotel entries as places in the itinerary items; hotels only influence timing (check-in/out) and context.\n")
    parts.append("Rules:\n")
    parts.append("- Each day's order should be optimized by compute_route once per day if there are 2+ places.\n")
    parts.append("- For main itinerary items: include up to 3 photos, 1-sentence description (<=25 words), and 2–3 short review lines.\n")
    parts.append("- For suggestedPlaces and hiddenGems: exactly 1 photo, exactly 1 short review, and rating if available via place_details.\n")
    parts.append("- Limit suggestedPlaces to at most 3 and hiddenGems to at most 2.\n")
    parts.append("- Limit total place_details calls to at most 8 across the plan.\n")
    parts.append("- Consider any provided travel and accommodation context from input when building feasible day plans.\n")
    parts.append("- Base Day 1 timing on the selected outbound arrival window when possible; keep schedule realistic relative to check-in.\n")
    parts.append("Output MUST strictly match this JSON template (keys and types):\n")
    parts.append("Template: " + template_json + "\n")
    parts.append("Input: " + str(input_json) + "\n")

    async def _run():
        async with mcp_client:
            cfg = genai.types.GenerateContentConfig(
                tools=[mcp_client.session],
            )
            resp = await _gemini_client.aio.models.generate_content(
                model=_MODEL,
                contents=''.join(parts),
                config=cfg,
            )
            return parse_json_response(resp)

    return await _run()
