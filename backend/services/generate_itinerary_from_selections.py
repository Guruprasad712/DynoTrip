import os
from typing import Any, Dict
from .common import get_mcp_client, _MODEL, _gemini_client, read_file, parse_json_response, geocode_place, get_hourly_weather_summary
from datetime import datetime
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

    # Try to fetch a concise weather summary for the trip destination/dates and include it in the prompt.
    parts = []
    parts.append("You are an AI itinerary planner.\n")
    parts.append("Use ONLY this MCP tool: place_details(query). Do NOT call any other tools.\n")
    # Collect a small weather summary to provide context to the LLM (help it prefer indoor/outdoor activities).
    try:
        start = input_json.get('startDate')
        end = input_json.get('endDate')
        days = 3
        if start and end:
            try:
                sd = datetime.fromisoformat(start).date()
                ed = datetime.fromisoformat(end).date()
                days = max(1, (ed - sd).days + 1)
            except Exception:
                days = 3
        dest = input_json.get('destination') or (input_json.get('selections') or {}).get('destination')
        weather_summary_text = ''
        if dest:
            geo = geocode_place(dest)
            if geo:
                weather = get_hourly_weather_summary(geo['lat'], geo['lng'], days=days)
                if weather:
                    summary_lines = [f"{d}: {v.get('summary')} (avg {v.get('avg_temp')}C)" for d, v in weather.items()]
                    weather_summary_text = "\n".join(summary_lines)
    except Exception:
        weather_summary_text = ''
    if weather_summary_text:
        parts.append("Weather summary for trip dates/destination (concise):\n" + weather_summary_text + "\n")
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
    parts.append("- Each day's order should be route-aware: consider realistic travel times between places and produce an order that minimizes travel time and is feasible for the day.\n")
    parts.append("- For main itinerary items: include up to 3 photos, 1-sentence description (<=25 words), and 2–3 short review lines.\n")
    parts.append("- For each itinerary item (generatedPlan.storyItinerary[].items[]), include a 'weather' object with keys: date (YYYY-MM-DD), summary (short word like Rainy/Sunny/Cloudy), and avg_temp (C or null).\n")
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
            parsed = parse_json_response(resp)

            # Normalize weather fields so each itinerary item has the template shape
            try:
                gp = parsed.get('generatedPlan') if isinstance(parsed.get('generatedPlan'), dict) else None
                if gp:
                    for day in gp.get('storyItinerary') or []:
                        day_date = day.get('date')
                        for itm in day.get('items') or []:
                            w = itm.get('weather')
                            # If not a dict or missing, set not available
                            if not isinstance(w, dict):
                                itm['weather'] = {'temperature': 'not available', 'condition': 'not available'}
                                continue
                            # If already in expected shape, ensure values present
                            if 'temperature' in w and 'condition' in w:
                                if w.get('temperature') is None or w.get('temperature') == '':
                                    itm['weather']['temperature'] = 'not available'
                                if not w.get('condition'):
                                    itm['weather']['condition'] = 'not available'
                                continue
                            # Otherwise assume per-date map -> pick entry by day_date or first available
                            entry = None
                            if day_date and day_date in w:
                                entry = w.get(day_date)
                            elif w:
                                first = next(iter(w.values()))
                                entry = first
                            if not isinstance(entry, dict):
                                itm['weather'] = {'temperature': 'not available', 'condition': 'not available'}
                                continue
                            temp = entry.get('avg_temp') if 'avg_temp' in entry else entry.get('temperature')
                            cond = entry.get('summary') if 'summary' in entry else entry.get('condition')
                            itm['weather'] = {
                                'temperature': temp if temp is not None else 'not available',
                                'condition': cond if cond is not None else 'not available',
                            }
            except Exception:
                # On any error during normalization, leave parsed as-is but ensure minimal fields
                try:
                    gp = parsed.get('generatedPlan') if isinstance(parsed.get('generatedPlan'), dict) else None
                    if gp:
                        for day in gp.get('storyItinerary') or []:
                            for itm in day.get('items') or []:
                                if not isinstance(itm.get('weather'), dict):
                                    itm['weather'] = {'temperature': 'not available', 'condition': 'not available'}
                except Exception:
                    pass

            return parsed

    return await _run()
