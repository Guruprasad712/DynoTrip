import asyncio
import argparse
import json
import os
import sys
from dotenv import load_dotenv
from fastmcp import Client
try:
    # Prefer HTTP if available (may not be on your fastmcp version)
    from fastmcp.client.transports import StreamableHttpTransport  # type: ignore
except Exception:  # pragma: no cover
    StreamableHttpTransport = None  # type: ignore

# Stdio/subprocess transport may not exist on all versions; we will fall back gracefully.
try:
    from fastmcp.client.transports import SubprocessTransport  # type: ignore
except Exception:  # pragma: no cover
    SubprocessTransport = None  # type: ignore

from google import genai

# Import TripItinerary schema for structured JSON output
from agents.itinerary_agent.utils.vertex_ai import TripItinerary
from agents.itinerary_agent.utils.firestore_client import FirestoreClient

load_dotenv()

# Reduce noisy warnings from SDKs about non-text parts, etc.
import logging
logging.getLogger("google.genai").setLevel(logging.ERROR)
logging.getLogger("fastmcp").setLevel(logging.ERROR)

def _json_default(o):
    # Convert Firestore timestamps (DatetimeWithNanoseconds) or datetime to ISO strings
    import datetime as _dt
    if isinstance(o, _dt.datetime):
        # Ensure timezone-aware ISO8601
        if o.tzinfo is None:
            o = o.replace(tzinfo=_dt.timezone.utc)
        return o.isoformat()
    return str(o)

def _extract_all_text(resp) -> str:
    """Extract and concatenate all text parts from the response if present.
    Falls back to resp.text when parts are absent.
    """
    try:
        texts = []
        candidates = getattr(resp, "candidates", None) or []
        for cand in candidates:
            content = getattr(cand, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            if parts:
                for p in parts:
                    t = getattr(p, "text", None)
                    if t:
                        texts.append(t)
        if texts:
            return "".join(texts)
    except Exception:
        pass
    # Fallback
    return getattr(resp, "text", "")

def read_input_json() -> dict:
    parser = argparse.ArgumentParser(description="DynoTrip: JSON-in/JSON-out itinerary generator using MCP tools")
    parser.add_argument("--input-file", "-i", help="Path to JSON file containing user preferences. If omitted, reads from stdin.")
    args = parser.parse_args()

    try:
        if args.input_file:
            with open(args.input_file, "r", encoding="utf-8") as f:
                return json.load(f)
        else:
            data = sys.stdin.read()
            if not data.strip():
                raise ValueError("No input provided. Pass --input-file or pipe JSON to stdin.")
            return json.loads(data)
    except json.JSONDecodeError as e:
        print(f"Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)

# Try to set up an MCP client. Prefer HTTP if available, else try subprocess.
mcp_client = None
if 'MCP_SERVER_URL' in os.environ and StreamableHttpTransport is not None:
    try:
        transport = StreamableHttpTransport(url=os.environ['MCP_SERVER_URL'])
        mcp_client = Client(transport=transport)
    except Exception:
        mcp_client = None
if mcp_client is None and SubprocessTransport is not None:
    # Spawn agent.py as a subprocess if supported
    AGENT_PATH = os.path.join(os.path.dirname(__file__), "agents", "itinerary_agent", "utils", "agent.py")
    if os.path.exists(AGENT_PATH):
        try:
            transport = SubprocessTransport([sys.executable, AGENT_PATH])
            mcp_client = Client(transport=transport)
        except Exception:
            mcp_client = None

# Configure Gemini client (Vertex AI)
gemini_client = genai.Client(
    vertexai=True,
    project=os.getenv("PROJECT_ID"),
    location=os.getenv("VERTEX_AI_LOCATION", "us-central1"),
)
MODEL = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")

def build_prompt(user_input: dict) -> str:
    return (
        "You are an AI travel assistant.\n"
        "Use the provided MCP tools to fetch travel and accommodation options from Firestore.\n"
        "- Use get_travel_options(frm, to, depart_date) to fetch travel options.\n"
        "- Use get_accommodation(city) to fetch accommodation options.\n"
        "Only choose from the returned options; do not invent new ones.\n"
        "Return a structured JSON that matches the TripItinerary schema.\n"
        "User Input: "
        + json.dumps(user_input, ensure_ascii=False, default=_json_default)
    )

async def run(user_input: dict):
    try:
        print("[main] Starting run()", file=sys.stderr)
        # If an MCP client is available, let Gemini use tools dynamically.
        if mcp_client is not None:
            print("[main] Using MCP tools path", file=sys.stderr)
            prompt = build_prompt(user_input)
            async with mcp_client:
                response = await asyncio.wait_for(
                    gemini_client.aio.models.generate_content(
                        model=MODEL,
                        contents=prompt,
                        config=genai.types.GenerateContentConfig(
                            tools=[mcp_client.session],
                            response_mime_type="application/json",
                            response_schema=TripItinerary,
                        ),
                    ),
                    timeout=180,
                )
        else:
            # Fallback: fetch Firestore data directly and let Gemini plan with injected options.
            print("[main] Using direct Firestore fallback path", file=sys.stderr)
            fs = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
            frm = user_input.get("departure") or user_input.get("from")
            to = user_input.get("destination") or user_input.get("to")
            depart_date = user_input.get("startDate") or user_input.get("depart_date")
            city_for_stay = to
            print(f"[main] Querying Firestore: from={frm}, to={to}, depart_date={depart_date}", file=sys.stderr)
            travel_opts = fs.get_travel_options(frm, to, depart_date) if frm and to else []
            stay_opts = fs.get_accommodation(city_for_stay) if city_for_stay else []
            print(f"[main] Found travel={len(travel_opts)} options, accommodation={len(stay_opts)} options", file=sys.stderr)
            enriched = {
                **user_input,
                "available_travel_options": travel_opts,
                "available_accommodation_options": stay_opts,
            }
            prompt = (
                "You are an AI travel assistant. Given the user preferences and the provided travel and accommodation "
                "options (do not invent new ones for travel or accommodation), plan the itinerary. Return JSON that "
                "matches the TripItinerary schema.\nData:\n" + json.dumps(enriched, ensure_ascii=False, default=_json_default)
            )
            response = await asyncio.wait_for(
                gemini_client.aio.models.generate_content(
                    model=MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=TripItinerary,
                    ),
                ),
                timeout=180,
            )
        # Print result
        if getattr(response, "parsed", None) is not None:
            print(json.dumps(response.parsed.model_dump(), indent=2))
        else:
            print(_extract_all_text(response))
    except asyncio.TimeoutError:
        print("[error] Generation timed out after 180s. Check network/VPC egress and Vertex AI permissions.", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"[error] {type(e).__name__}: {e}", file=sys.stderr)
        raise

if __name__ == "__main__":
    prefs = read_input_json()
    asyncio.run(run(prefs))
