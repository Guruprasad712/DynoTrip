import os
import logging
import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Optional
from .common import get_mcp_client, _MODEL, _gemini_client, parse_json_response, geocode_place, get_hourly_weather_summary
from datetime import datetime
from google import genai

logger = logging.getLogger(__name__)

# Use absolute path for template file
TEMPLATE_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__),
    "..",
    "templates",
    "output_jsons",
    "generated_itinerary.json"
))

# Cache template to avoid reading file on every request
_TEMPLATE_CACHE: Optional[str] = None

async def read_file_async(path: str) -> str:
    """Asynchronously read file content with proper error handling."""
    try:
        return await asyncio.get_event_loop().run_in_executor(
            None, 
            lambda: Path(path).read_text(encoding='utf-8')
        )
    except Exception as e:
        logger.error(f"Failed to read file {path}: {str(e)}")
        return "{}"

async def generate_itinerary_from_selections(input_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate itinerary using ONLY MCP tools for places and route optimizer.
    Should consider available travel and stay information included in input_json.
    Expects `input_json` matching templates/input_jsons/input_selections.json.
    
    Args:
        input_json: Dictionary containing trip details and preferences
        
    Returns:
        Dict containing the generated itinerary
        
    Raises:
        RuntimeError: If MCP server is not available or other critical errors occur
    """
    global _TEMPLATE_CACHE
    
    # Initialize template and MCP client
    try:
        if _TEMPLATE_CACHE is None:
            _TEMPLATE_CACHE = await read_file_async(TEMPLATE_PATH)
        
        template_json = _TEMPLATE_CACHE
        if not template_json or template_json == "{}":
            logger.error(f"Failed to load template from {TEMPLATE_PATH}")
            template_json = '{"error": "Failed to load template"}'
            
        mcp_client = get_mcp_client()
        if mcp_client is None:
            logger.error("MCP client initialization failed")
            raise RuntimeError(
                "MCP server not available. Please ensure MCP_SERVER_URL is set and the server is running."
            )
    except Exception as e:
        logger.error(f"Initialization error: {str(e)}", exc_info=True)
        raise RuntimeError(f"Failed to initialize itinerary generation: {str(e)}")

    # Initialize prompt parts
    parts = [
        "You are an AI itinerary planner.\n",
        "Use ONLY this MCP tool: place_details(query). Do NOT call any other tools.\n"
    ]
    # Collect a small weather summary to provide context to the LLM
    weather_summary_text = ''
    weather = {}
    
    try:
        # Parse trip dates
        start = input_json.get('startDate')
        end = input_json.get('endDate')
        days = 3
        
        if start and end:
            try:
                sd = datetime.fromisoformat(start).date()
                ed = datetime.fromisoformat(end).date()
                days = max(1, (ed - sd).days + 1)
                logger.info(f"Trip duration: {days} days ({start} to {end})")
            except (ValueError, TypeError) as e:
                logger.warning(f"Failed to parse dates: {e}")
                days = 3
        
        # Get destination
        dest = input_json.get('destination') or (input_json.get('selections') or {}).get('destination')
        if not dest:
            logger.warning("No destination found in input")
        else:
            logger.info(f"Processing destination: {dest}")
            
            try:
                # Geocode the destination
                geo = await asyncio.get_event_loop().run_in_executor(
                    None, 
                    lambda: geocode_place(dest)
                )
                
                if not geo or 'lat' not in geo or 'lng' not in geo:
                    logger.warning(f"Could not geocode destination: {dest}")
                else:
                    logger.info(f"Geocoded {dest} to lat={geo['lat']}, lng={geo['lng']}")
                    
                    # Get weather data
                    weather = await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: get_hourly_weather_summary(geo['lat'], geo['lng'], days=days)
                    )
                    
                    if weather:
                        summary_lines = []
                        for d, v in weather.items():
                            temp = v.get('avg_temp')
                            summary = v.get('summary', 'N/A')
                            temp_str = f"{temp}C" if temp is not None else "N/A"
                            summary_lines.append(f"{d}: {summary} (avg {temp_str})")
                        
                        weather_summary_text = "\n".join(summary_lines)
                        logger.info(f"Fetched weather for {len(weather)} days")
                    else:
                        logger.warning("No weather data returned from API")
                        
            except Exception as e:
                logger.error(f"Error processing destination or weather: {e}", exc_info=True)
    
    except Exception as e:
        logger.error(f"Unexpected error in weather processing: {e}", exc_info=True)
    
    # Add weather summary to prompt if available
    if weather_summary_text:
        parts.append("\nWeather summary for trip dates/destination (concise):\n" + weather_summary_text + "\n")
    else:
        logger.warning("No weather summary available for prompt")
    # Add remaining prompt parts
    prompt_parts = [
        "Do NOT call any other tools.\n",
        "Input structure: top-level contains user preferences (departure, destination, startDate, endDate, members, activities, tripTheme, budget, specialInstructions).\n",
        "Input also contains selections under 'selections' with chosen travel and accommodation.\n",
        "Strict rule: Use ONLY the provided travel and accommodation from input.selections. Do NOT invent or replace them.\n",
        "Align the entire plan with user preferences (dates, party size, theme, activities, budget) from top-level fields.\n",
        "Accommodation handling (two modes):\n",
        "- If selections.hotelsSelection.useSameHotel == true, use selections.hotelsSelection.booking for the whole stay (check-in/check-out).\n",
        "- If selections.hotelsSelection.useSameHotel == false, respect selections.hotelsSelection.bookingPerDay (array of {day, date, hotelId, name, pricePerNight}).\n",
        "- Do NOT add hotel entries as places in the itinerary items; hotels only influence timing (check-in/out) and context.\n",
        "Rules:\n",
        "- Each day's order should be route-aware: consider realistic travel times between places and produce an order that minimizes travel time and is feasible for the day.\n",
        "- For main itinerary items: include up to 2 photos, 1-sentence description (<=20 words), and 1–2 short review lines.\n",
        "- For each itinerary item (generatedPlan.storyItinerary[].items[]), include a 'weather' object with keys: date (YYYY-MM-DD), summary (short word like Rainy/Sunny/Cloudy), and avg_temp (C or null).\n",
        "- For suggestedPlaces and hiddenGems: exactly 1 photo, exactly 1 short review, and rating if available via place_details.\n",
        "- Limit suggestedPlaces to at most 3 and hiddenGems to at most 2.\n",
        "- Limit total place_details calls to at most 5 across the plan to optimize performance.\n",
        "- Consider any provided travel and accommodation context from input when building feasible day plans.\n",
        "- Base Day 1 timing on the selected outbound arrival window when possible; keep schedule realistic relative to check-in.\n",
        "Output MUST strictly match this JSON template (keys and types):\n",
        "Template: " + template_json + "\n",
        "Input: " + json.dumps(input_json, indent=2) + "\n"
    ]
    
    # Combine all parts
    full_prompt = "".join(parts + prompt_parts)
    
    try:
        # Generate the itinerary using the Gemini client
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: _gemini_client.models.generate_content(
                    model=_MODEL,
                    contents=full_prompt,
                    generation_config={
                        "temperature": 0.2,
                        "max_output_tokens": 4000,
                    }
                )
            )
            
            # Extract the response text
            if hasattr(response, 'text'):
                response_text = response.text
            elif hasattr(response, 'candidates') and response.candidates:
                response_text = response.candidates[0].content.parts[0].text
            else:
                response_text = str(response)
            
            if not response_text:
                raise RuntimeError("No response from the AI model")
                
        except Exception as e:
            logger.error(f"Error generating content: {str(e)}", exc_info=True)
            raise RuntimeError(f"Failed to generate content: {str(e)}")
            
        # Try to parse the JSON response
        try:
            result = json.loads(response.text)
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.error(f"Raw response: {response.text}")
            return {"error": "Failed to generate itinerary: invalid response format"}
            
    except Exception as e:
        logger.error(f"Error generating itinerary: {str(e)}", exc_info=True)
        return {"error": f"Failed to generate itinerary: {str(e)}"}

    # The function now returns the response directly from the try-except block above
    # No need for additional code here
    
    # The rest of the function is now handled in the try-except block above
    # and we return the response directly from there
