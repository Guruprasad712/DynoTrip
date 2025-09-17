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

async def generate_end_to_end_itinerary(prev_plan: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate an end-to-end itinerary using ONLY MCP tools for places and route optimizer,
    taking into account the previous itinerary structure and days (prev_plan).
    Expects `prev_plan` matching templates/input_jsons/input_itinerary.json (generatedPlan object).
    """
    template_json = read_file(TEMPLATE_PATH)
    mcp_client = get_mcp_client()
    if mcp_client is None:
        raise RuntimeError("MCP server not available. Please run agents/itinerary_agent/utils/agent.py and set MCP_SERVER_URL.")

    parts = []
    parts.append("You are an AI itinerary planner.\n")
    parts.append("Use ONLY these MCP tools: place_details(query) and compute_route(origin, destination, intermediates).\n")
    parts.append("Do NOT call any other tools.\n")
    parts.append("Incorporate and refine the provided previous itinerary (generatedPlan) while improving order with route optimization and enriching places with details.\n")
    parts.append("Rules:\n")
    parts.append("- Each day's order should be optimized by compute_route once per day if there are 2+ places.\n")
    parts.append("- For main itinerary items: include up to 3 photos, 1-sentence description (<=25 words), and 2–3 short review lines.\n")
    parts.append("- For suggestedPlaces and hiddenGems: exactly 1 photo, exactly 1 short review, and rating if available via place_details.\n")
    parts.append("- Limit suggestedPlaces to at most 3 and hiddenGems to at most 2.\n")
    parts.append("- Limit total place_details calls to at most 8 across the plan.\n")
    parts.append("Output MUST strictly match this JSON template (keys and types):\n")
    parts.append("Template: " + template_json + "\n")
    parts.append("Previous Itinerary (generatedPlan): " + str(prev_plan) + "\n")
    parts.append("If the previous itinerary contains 'specialInstructions', use it to guide choices (meals, timing, preferences), BUT set specialInstructions=\"\" (empty) in the final output JSON.\n")

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
            parsed = parse_json_response(resp)
            try:
                if isinstance(parsed, dict):
                    # Blank out specialInstructions wherever it appears
                    if 'specialInstructions' in parsed:
                        parsed['specialInstructions'] = ""
                    gp = parsed.get('generatedPlan') if isinstance(parsed.get('generatedPlan'), dict) else None
                    if gp and 'specialInstructions' in gp:
                        gp['specialInstructions'] = ""
            except Exception:
                pass
            return parsed

    return await _run()
