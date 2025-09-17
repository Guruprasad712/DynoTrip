from typing import Any, Dict
from .common import get_mcp_client, _MODEL, _gemini_client, read_file, parse_json_response
from google import genai
import os

TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "templates",
    "output_jsons",
    "stay_travel.json",
)

async def generate_travel_and_stay(user_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate travel and accommodation JSON using ONLY MCP Firestore tools.
    Expects `user_input` with keys matching templates/input_jsons/input_user_pref.json (inputJson).
    """
    template_json = read_file(TEMPLATE_PATH)
    mcp_client = get_mcp_client()
    if mcp_client is None:
        raise RuntimeError("MCP server not available. Please run agents/itinerary_agent/utils/agent.py and set MCP_SERVER_URL.")

    # Build strict instruction
    parts = []
    parts.append("You are an assistant generating travel and accommodation options.\n")
    parts.append("Use ONLY these MCP tools: get_travel_options(frm, to, depart_date) and get_accommodation(city).\n")
    parts.append("Do NOT call any other tools.\n")
    parts.append("Output MUST be valid JSON matching the following template strictly (keys and types):\n")
    parts.append("Template: " + template_json + "\n")
    parts.append("User Input: " + str(user_input) + "\n")

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

    import asyncio
    return await _run()
