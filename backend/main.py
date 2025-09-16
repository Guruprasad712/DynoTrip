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

# Import schema and Firestore helper
from agents.itinerary_agent.utils.plan_schema import TripPlan
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

def _parse_duration_to_minutes(duration: str) -> int:
    """Parse a duration string like '3 hrs', '2h 30m', '45 min' into total minutes."""
    if not duration:
        return 0
    import re
    s = duration.strip().lower()
    total = 0
    # Patterns: 'X hrs', 'X hr', 'Xh', 'X hours'
    h_match = re.search(r"(\d+)\s*(h|hr|hrs|hour|hours)\b", s)
    if h_match:
        total += int(h_match.group(1)) * 60
    m_match = re.search(r"(\d+)\s*(m|min|mins|minute|minutes)\b", s)
    if m_match:
        total += int(m_match.group(1))
    # Fallback: plain integer assume minutes
    if total == 0:
        plain = re.search(r"^(\d+)$", s)
        if plain:
            total = int(plain.group(1))
    return total

def _enrich_travel_options_with_times(travel_opts: list[dict]) -> list[dict]:
    """Add local departure and arrival timestamps/strings to each travel option if possible.
    Uses TIMEZONE env (default Asia/Kolkata). Assumes depart_date is datetime.
    """
    import datetime as _dt
    try:
        from zoneinfo import ZoneInfo  # Python 3.9+
    except Exception:
        ZoneInfo = None  # type: ignore
    tz_name = os.getenv("TIMEZONE", "Asia/Kolkata")
    if ZoneInfo is not None:
        local_tz = ZoneInfo(tz_name)
    else:
        local_tz = _dt.timezone(_dt.timedelta(hours=5, minutes=30))  # IST fallback
    enriched = []
    for opt in travel_opts or []:
        opt2 = dict(opt)
        depart = opt.get("depart_date")
        duration = opt.get("duration")
        try:
            if isinstance(depart, _dt.datetime):
                # Convert to local time for representation
                d_local = depart if depart.tzinfo else depart.replace(tzinfo=_dt.timezone.utc)
                d_local = d_local.astimezone(local_tz)
                opt2["depart_local_iso"] = d_local.isoformat()
                mins = _parse_duration_to_minutes(str(duration))
                if mins > 0:
                    arr_local = d_local + _dt.timedelta(minutes=mins)
                    opt2["arrival_local_iso"] = arr_local.isoformat()
        except Exception:
            pass
        enriched.append(opt2)
    return enriched

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

def _read_plan_template() -> str:
    """Load the JSON plan template to instruct the LLM on the exact output shape."""
    template_path = os.path.join(
        os.path.dirname(__file__),
        "agents",
        "itinerary_agent",
        "utils",
        "plan_template.json",
    )
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return "{}"

def build_prompt(user_input: dict, template_json: str) -> str:
    # Derive helper hints from user input for stronger alignment
    import datetime as _dt
    start = user_input.get('startDate')
    end = user_input.get('endDate')
    num_days_hint = ''
    try:
        if start and end:
            sd = _dt.date.fromisoformat(str(start))
            ed = _dt.date.fromisoformat(str(end))
            # Inclusive day count (e.g., 19..21 -> 3 days)
            num_days = (ed - sd).days + 1
            if num_days > 0:
                num_days_hint = f"- Create storyItinerary with exactly {num_days} days covering {start} to {end}.\n"
    except Exception:
        pass
    activities = user_input.get('activities') or []
    theme = user_input.get('tripTheme') or ''
    budget = user_input.get('budget')
    adults = (user_input.get('members') or {}).get('adults')
    children = (user_input.get('members') or {}).get('children')

    parts = []
    parts.append("You are an AI travel assistant.\n")
    parts.append("When available, use MCP tools to fetch data: \n")
    parts.append("- get_travel_options(frm, to, depart_date)\n")
    parts.append("- get_accommodation(city)\n")
    parts.append("- place_details(query): returns {rating, total_ratings, rating_str, photos:[url...], reviews:[text...]} for a place name/text query.\n")
    parts.append("Constraints:\n")
    parts.append("- Generate an itinerary strictly matching the following JSON template shape (keys and types).\n")
    parts.append("- For each place that you mention in storyItinerary.items (PlaceItem), and for each item in suggestedPlaces and hiddenGems, you MUST call the MCP tool place_details using a query formatted as '<place title>, <destination city>'.\n")
    parts.append("- Destination city hint to use in queries: '" + str(user_input.get('destination') or user_input.get('to') or '') + "'.\n")
    if num_days_hint:
        parts.append(num_days_hint)
    if activities:
        parts.append(f"- Optimize for activities: {', '.join(activities)}.\n")
    if theme:
        parts.append(f"- Trip theme: {theme}. Reflect this in place choices and descriptions.\n")
    if budget is not None:
        parts.append(f"- Budget: {budget}. Keep choices consistent with the budget level.\n")
    if adults is not None or children is not None:
        parts.append(f"- Party: adults={adults}, children={children}. Prefer family-friendly options if children>0.\n")
    parts.append("- Populate photos (array of URLs), reviews (array of up to 3 review texts), and rating (string) from the tool response.\n")
    parts.append("  The rating field must be a string formatted exactly as '<avg-rating> (<total-ratings>)', e.g., '4.6 (1234)'.\n")
    parts.append("  Prefer place_details.rating_str when available; otherwise format from place_details.rating and place_details.total_ratings.\n")
    parts.append("- Limit the total number of place_details calls to at most 14 across the entire plan to keep responses fast. If you exceed this budget, enrich the first items and leave the rest with photos=[], reviews=[], rating=null.\n")
    parts.append("- If the tool fails or returns no data for a particular place, set photos=[], reviews=[], and rating=null for that place.\n")
    parts.append("- Other values (ids, titles, descriptions) should be generated.\n")
    parts.append("- Use get_travel_options to list available options. Choose ONE primary option that best fits budget and schedule.\n")
    parts.append("- Compute the actual ARRIVAL local time = depart_date + duration (convert to destination local timezone).\n")
    parts.append("- Adapt Day 1 strictly based on this arrival time: if arrival > 12:00, skip breakfast; if arrival > 18:00, skip sightseeing and prioritize dinner/check-in.\n")
    parts.append("- If arrival is late night (e.g., after 22:00), keep Day 1 minimal (check-in, light snack, rest) and shift main activities to subsequent days.\n")
    parts.append("- Use accommodation from the provided options only.\n")
    parts.append("- Do NOT include any extra commentary. Output JSON only.\n")
    parts.append("Template: " + template_json + "\n")
    parts.append("User Input: " + json.dumps(user_input, ensure_ascii=False, default=_json_default))
    return ''.join(parts)

async def run(user_input: dict):
    try:
        print("[main] Starting run()", file=sys.stderr)
        # Determine generation timeout
        try:
            gen_timeout = int(os.getenv("GENERATION_TIMEOUT_SEC", "300"))
        except Exception:
            gen_timeout = 300
        print(f"[main] Using generation timeout: {gen_timeout}s", file=sys.stderr)
        # If an MCP client is available, let Gemini use tools dynamically.
        if mcp_client is not None:
            print("[main] Using MCP tools path", file=sys.stderr)
            template_json = _read_plan_template()
            prompt = build_prompt(user_input, template_json)
            async with mcp_client:
                response = await asyncio.wait_for(
                    gemini_client.aio.models.generate_content(
                        model=MODEL,
                        contents=prompt,
                        config=genai.types.GenerateContentConfig(
                            tools=[mcp_client.session],
                            response_mime_type="application/json",
                            response_schema=TripPlan,
                        ),
                    ),
                    timeout=gen_timeout,
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
            template_json = _read_plan_template()
            enriched = {
                **user_input,
                "available_travel_options": _enrich_travel_options_with_times(travel_opts),
                "available_accommodation_options": stay_opts,
            }
            prompt = (
                "You are an AI travel assistant. Given the user preferences and the provided travel and accommodation options "
                "(do not invent new ones), compute arrival time from each travel option's depart_date + duration (local timezone), and adapt meals/activities accordingly.\n"
                "Rules: If arrival after 12:00 local, skip breakfast and start from check-in/places/snacks/dinner. If arrival after 18:00, skip sightseeing and prioritize dinner/check-in.\n"
                "Generate an itinerary strictly matching the provided template shape.\n"
                "For each place that you mention (PlaceItem, suggestedPlaces, hiddenGems), set photos=[], reviews=[], rating=null since MCP tools are not available in this fallback path. Output JSON only.\n"
                "Data:\n"
                + json.dumps(enriched, ensure_ascii=False, default=_json_default)
                + "\nTemplate:\n" + template_json
            )
            response = await asyncio.wait_for(
                gemini_client.aio.models.generate_content(
                    model=MODEL,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=TripPlan,
                    ),
                ),
                timeout=gen_timeout,
            )
        # Extract parsed JSON and save only the JSON to Firestore
        destination = user_input.get("destination") or user_input.get("to") or "unknown"
        fs_for_save = FirestoreClient(credentials_path=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
        plan_dict = None
        if getattr(response, "parsed", None) is not None:
            try:
                # If parsed is a Pydantic model (TripPlan), convert to dict
                plan_dict = response.parsed.model_dump(by_alias=True)
            except Exception:
                try:
                    plan_dict = json.loads(json.dumps(response.parsed))
                except Exception:
                    plan_dict = None
        if plan_dict is None:
            # Fallback: try to extract JSON from text-only response
            text = _extract_all_text(response)
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1 and end > start:
                try:
                    plan_dict = json.loads(text[start:end+1])
                except Exception:
                    plan_dict = None
        if plan_dict is None:
            raise ValueError("LLM did not return valid JSON matching TripPlan")

        # Save JSON to Firestore
        doc_id = fs_for_save.save_generated_plan(destination, plan_dict)
        print(json.dumps({"saved_document_id": doc_id}, ensure_ascii=False))
    except asyncio.TimeoutError:
        print(f"[error] Generation timed out after {gen_timeout}s. Check network/VPC egress and Vertex AI permissions.", file=sys.stderr)
        sys.exit(2)
    except Exception as e:
        print(f"[error] {type(e).__name__}: {e}", file=sys.stderr)
        raise

if __name__ == "__main__":
    prefs = read_input_json()
    asyncio.run(run(prefs))
