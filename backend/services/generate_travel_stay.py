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

    # Build strict instruction (prompt-only change to force Firestore lookups via MCP tools)
    parts = []
    parts.append("You are an assistant generating travel and accommodation options.\n")
    parts.append("Use ONLY these MCP tools: get_travel_options(frm, to, depart_date) and get_accommodation(city).\n")
    parts.append("Do NOT call any other tools. Do NOT fabricate any values; populate from Firestore documents returned by these tools.\n")
    parts.append("Tool calling steps (MANDATORY):\n")
    parts.append("1) Call get_travel_options(frm=User Input.departure, to=User Input.destination, depart_date=User Input.startDate) for the outbound leg.\n")
    parts.append("2) Call get_travel_options(frm=User Input.destination, to=User Input.departure, depart_date=User Input.endDate) for the return leg.\n")
    parts.append("3) Call get_accommodation(city=User Input.destination) to fetch hotels.\n")
    parts.append("Map the raw Firestore fields into the template, preserving ids, names, timings, and prices when present. If any list is empty, leave it empty (the API will enhance with fallbacks).\n")
    parts.append("Output MUST be valid JSON matching the following template strictly (keys and types):\n")
    parts.append("Template: " + template_json + "\n")
    parts.append("User Input: " + str(user_input) + "\n")

    def _estimate_distance_km(frm: str, to: str) -> int:
        if not frm or not to:
            return 50
        key = f"{frm.strip().lower()}->{to.strip().lower()}"
        table = {
            'chennai->pondicherry': 165,
            'pondicherry->chennai': 165,
            'salem->yercaud': 30,
            'yercaud->salem': 30,
            'salem->kolli hills': 85,
            'kolli hills->salem': 85,
            'chennai->yercaud': 350,
            'yercaud->chennai': 350,
            'chennai->kolli hills': 350,
            'kolli hills->chennai': 350,
            'bengaluru->pondicherry': 320,
            'pondicherry->bengaluru': 320,
        }
        return int(table.get(key, 120))

    def _own_option(frm: str, to: str) -> Dict[str, Any]:
        km = _estimate_distance_km(frm, to)
        per_km = 12
        tolls = 100
        duration = int(round(km * 60 / 50))  # assume ~50 km/h
        price = int(per_km * km + tolls)
        return {
            'id': 'own-auto',
            'distanceKm': km,
            'estimatedDurationMinutes': duration,
            'basePerKmRate': per_km,
            'estimatedFuelCost': max(0, price - tolls),
            'tollsApprox': tolls,
            'price': price,
            'recommended': True,
            'notes': 'Auto-added fallback based on distance estimate',
        }

    def _ensure_array(v):
        return v if isinstance(v, list) else []

    def _ensure_photo_list(arr):
        a = _ensure_array(arr)
        return a if len(a) > 0 else ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80']

    def _postprocess(result: Dict[str, Any]) -> Dict[str, Any]:
        try:
            dep = str(user_input.get('departure') or '')
            dest = str(user_input.get('destination') or '')
            td = result.setdefault('travelDoc', {})
            meta = td.setdefault('meta', {})
            meta.setdefault('departure', dep)
            meta.setdefault('destination', dest)
            legs = td.setdefault('legs', {})
            for leg_name, frm, to in (
                ('outbound', dep, dest),
                ('return', dest, dep),
            ):
                leg = legs.setdefault(leg_name, {})
                leg.setdefault('label', f"{'Outbound' if leg_name=='outbound' else 'Return'} ({frm} → {to})")
                transport = leg.setdefault('transport', {})
                for k, lbl in (('bus', 'Bus Transport'), ('train', 'Train Transport'), ('flight', 'Flight Transport'), ('own', 'Own Transport')):
                    cat = transport.setdefault(k, {'type': k, 'label': lbl, 'options': []})
                    cat.setdefault('type', k)
                    cat.setdefault('label', lbl)
                    cat['options'] = _ensure_array(cat.get('options'))
                # Always ensure at least one 'own transport' option with distanceKm, even when other modes exist
                if len(transport['own']['options']) == 0:
                    transport['own']['options'] = [ _own_option(frm, to) ]
                else:
                    # If own options exist but lack distance, enrich the first one
                    first = transport['own']['options'][0]
                    if isinstance(first, dict) and ('distanceKm' not in first or not first.get('distanceKm')):
                        km = _estimate_distance_km(frm, to)
                        first['distanceKm'] = km
                        # Provide minimal defaults if missing
                        first.setdefault('id', 'own-auto')
                        first.setdefault('estimatedDurationMinutes', int(round(km * 60 / 50)))
                # Set recommended if missing
                rec = leg.setdefault('recommended', {})
                if not rec or not rec.get('type') or not rec.get('optionId'):
                    if len(transport['train']['options']):
                        rec.update({'type': 'train', 'optionId': transport['train']['options'][0].get('id', 'train-01')})
                    elif len(transport['bus']['options']):
                        rec.update({'type': 'bus', 'optionId': transport['bus']['options'][0].get('id', 'bus-01')})
                    elif len(transport['flight']['options']):
                        rec.update({'type': 'flight', 'optionId': transport['flight']['options'][0].get('id', 'flight-01')})
                    else:
                        rec.update({'type': 'own', 'optionId': transport['own']['options'][0].get('id', 'own-01')})

            # Ensure accommodationDoc has at least one hotel
            adoc = result.setdefault('accommodationDoc', {})
            hotels = adoc.setdefault('hotels', [])
            if not isinstance(hotels, list) or len(hotels) == 0:
                hotels = [{
                    'id': 'h-fallback-01',
                    'name': f"{dest or 'Destination'} Heritage Stay",
                    'address': f"Center, {dest}",
                    'photos': _ensure_photo_list([]),
                    'pricePerNight': 3000,
                    'rating': 4.4,
                    'checkInTime': '14:00',
                    'checkOutTime': '11:00',
                    'available': True,
                    'recommended': True,
                    'reviews': ['Great location', 'Comfortable rooms']
                }]
                adoc['hotels'] = hotels
            else:
                # ensure each hotel has photos
                for h in hotels:
                    if isinstance(h, dict):
                        h['photos'] = _ensure_photo_list(h.get('photos'))

            return result
        except Exception:
            return result

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
            return _postprocess(parsed)

    import asyncio
    return await _run()
