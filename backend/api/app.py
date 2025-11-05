import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional, List

import orjson
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

# Response class that uses orjson for faster JSON serialization
class ORJSONResponse(ORJSONResponse):
    media_type = "application/json"
    
    def render(self, content: Any) -> bytes:
        assert orjson is not None, "orjson must be installed to use ORJSONResponse"
        return orjson.dumps(
            content,
            option=orjson.OPT_SERIALIZE_NUMPY | orjson.OPT_SERIALIZE_UUID | orjson.OPT_NON_STR_KEYS,
        )

# Request logging middleware
class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
        
        logger.info(
            "%s %s %s %s %s %s",
            request.method,
            request.url.path,
            response.status_code,
            f"{process_time:.2f}ms",
            request.client.host if request.client else "unknown",
            request.headers.get("user-agent", ""),
        )
        return response

# Service modules
from services.generate_travel_stay import generate_travel_and_stay
from services.generate_itinerary_from_selections import generate_itinerary_from_selections
from services.generate_end_to_end_itinerary import generate_end_to_end_itinerary

def _normalize_bool(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in {"1", "true", "yes", "y"}
    return bool(v)

def _normalize_prefs(d: Dict[str, Any]) -> Dict[str, Any]:
    """Make incoming user preferences tolerant to alias keys and missing fields.
    Maps common aliases to the canonical keys expected by services.
    """
    if not isinstance(d, dict):
        return {}
    out: Dict[str, Any] = dict(d)
    # Aliases for city fields
    out.setdefault("departure", d.get("from") or d.get("fromCity") or d.get("source") or d.get("origin"))
    out.setdefault("destination", d.get("to") or d.get("toCity") or d.get("city") or d.get("destinationCity"))
    # Date aliases
    out.setdefault("startDate", d.get("start_date") or d.get("fromDate") or d.get("start"))
    out.setdefault("endDate", d.get("end_date") or d.get("toDate") or d.get("end"))
    # Theme/notes aliases
    out.setdefault("tripTheme", d.get("theme") or d.get("trip_type") or d.get("tripTheme"))
    out.setdefault("specialInstructions", d.get("notes") or d.get("instructions") or d.get("specialNotes"))
    # Activities alias
    if "activities" not in out:
        acts = d.get("interests") or d.get("activity")
        if isinstance(acts, str):
            out["activities"] = [acts]
        elif isinstance(acts, list):
            out["activities"] = acts
    # Members normalization
    members = out.get("members")
    if not isinstance(members, dict):
        members = {
            "adults": d.get("adults") or d.get("adultCount") or 0,
            "children": d.get("children") or d.get("childCount") or 0,
        }
    else:
        members = {
            "adults": members.get("adults") or members.get("adultCount") or 0,
            "children": members.get("children") or members.get("childCount") or 0,
        }
    out["members"] = members
    return out

def _normalize_selections(sel: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize selections payload: ensure expected keys exist and coerce simple types."""
    if not isinstance(sel, dict):
        return {}
    out = dict(sel)
    # Normalize hotelsSelection.useSameHotel to bool if given as string/number
    hs = out.get("hotelsSelection")
    if isinstance(hs, dict):
        if "useSameHotel" in hs:
            hs["useSameHotel"] = _normalize_bool(hs.get("useSameHotel"))
        out["hotelsSelection"] = hs
    # Pass through transportSelections structure as-is; services/LLM will consume it as context
    return out

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("dynotrip.api")

# Application lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting DynoTrip API...")
    
    try:
        # Initialize any resources here
        yield
    finally:
        # Cleanup
        logger.info("Shutting down DynoTrip API...")

# Initialize FastAPI with optimized settings
app = FastAPI(
    title="DynoTrip API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# Add middleware for performance and security
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time", "X-Request-ID"],
    max_age=600,  # 10 minutes
)

# Add GZip compression for responses
app.add_middleware(
    GZipMiddleware,
    minimum_size=1024,  # Only compress responses larger than 1KB
    compresslevel=6,    # Balance between speed and compression ratio
)

# Add request logging
app.add_middleware(LoggingMiddleware)

# Add OpenTelemetry instrumentation
try:
    FastAPIInstrumentor.instrument_app(app)
except Exception as e:
    logger.warning(f"Failed to instrument app with OpenTelemetry: {e}")

# Add request ID and timing headers
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
    return response

class Payload(BaseModel):
    payload: Dict[str, Any]

@app.get("/")
async def root():
    return {
        "service": "DynoTrip API",
        "status": "ok",
        "endpoints": [
            "/health",
            "/travel-stay",
            "/itinerary-from-selections",
            "/itinerary",
        ],
    }

@app.get("/health", response_model=Dict[str, Any])
async def health() -> Dict[str, Any]:
    """Health check endpoint with detailed system information.
    
    Returns:
        Dict containing service status and system metrics
    """
    import platform
    import psutil
    from datetime import datetime, timezone
    
    # Get system information
    system_info = {
        "status": "ok",
        "service": "DynoTrip API",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "system": {
            "platform": platform.system(),
            "release": platform.release(),
            "python_version": platform.python_version(),
            "cpu_count": psutil.cpu_count(),
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_usage": psutil.disk_usage('/').percent,
        },
        "dependencies": {
            "fastapi": "0.110.0",
            "uvicorn": "0.30.0",
            "pydantic": "2.7.0",
        },
        "environment": {
            "environment": os.getenv("ENVIRONMENT", "development"),
            "debug": os.getenv("DEBUG", "false").lower() == "true",
        }
    }
    
    # Check external service connections
    try:
        # Add any external service health checks here
        system_info["services"] = {
            "database": "ok",  # Add actual DB health check
            "cache": "ok",     # Add actual cache health check
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        system_info["status"] = "degraded"
        system_info["error"] = str(e)
    
    return system_info

@app.post("/travel-stay")
async def travel_stay_endpoint(body: Dict[str, Any]):
    try:
        # Accept flexible shapes:
        # 1) { "inputJson": { ...user preferences... } }  (back-compat)
        # 2) { "userPref": { ... } }
        # 3) { departure, destination, startDate, endDate, ... } (flat)
        data = None
        if isinstance(body, dict):
            if isinstance(body.get("inputJson"), dict):
                data = body["inputJson"]
            elif isinstance(body.get("userPref"), dict):
                data = body["userPref"]
            else:
                # If flat fields are present, treat the whole body as preferences
                keys = {"departure", "destination", "startDate", "endDate", "members", "activities", "tripTheme", "budget", "specialInstructions"}
                if any(k in body for k in keys):
                    data = body
        if isinstance(data, dict):
            data = _normalize_prefs(data)
        else:
            raise HTTPException(status_code=400, detail="Body must contain inputJson, userPref, or flat preference fields")
        result = await generate_travel_and_stay(data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e) or "Internal error while generating travel and stay"
        logger.exception("/travel-stay failed: %s", msg)
        raise HTTPException(status_code=500, detail=msg)

@app.post("/itinerary-from-selections")
async def itinerary_from_selections_endpoint(body: Dict[str, Any]):
    try:
        # Accept either of the following shapes:
        # 1) { "inputJson": { ...combined preferences + selections... } }
        # 2) { "userPref": { ... }, "selections": { ... } }
        data: Dict[str, Any] | None = None
        if isinstance(body, dict):
            if isinstance(body.get("inputJson"), dict):
                data = _normalize_prefs(body["inputJson"]) if isinstance(body["inputJson"], dict) else None
                # If nested selections provided inside inputJson, normalize them
                if isinstance(data, dict) and isinstance(body["inputJson"].get("selections"), dict):
                    data["selections"] = _normalize_selections(body["inputJson"]["selections"])
            else:
                user_pref = body.get("userPref")
                selections = body.get("selections")
                if isinstance(user_pref, dict) and isinstance(selections, dict):
                    # Merge user preferences at top-level and embed selections under 'selections'
                    merged = _normalize_prefs(user_pref)
                    merged["selections"] = _normalize_selections(selections)
                    data = merged
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="Body must contain inputJson object as per template or userPref + selections")
        result = await generate_itinerary_from_selections(data)
        return result
    except HTTPException:
        raise
    except ValueError as ve:
        # Typically from parse_json_response when model returns empty/malformed content
        msg = str(ve) or "Upstream model returned empty or invalid JSON"
        logger.warning("/itinerary-from-selections bad upstream JSON: %s", msg)
        raise HTTPException(status_code=502, detail=msg)
    except Exception as e:
        msg = str(e) or "Internal error while generating itinerary from selections"
        logger.exception("/itinerary-from-selections failed: %s", msg)
        raise HTTPException(status_code=500, detail=msg)

@app.post("/itinerary")
async def itinerary_endpoint(body: Dict[str, Any]):
    try:
        # Accept flexible shapes:
        # 1) { "generatedPlan": { ... } }  (primary)
        # 2) { "inputJson": { "generatedPlan": { ... } } }  (back-compat)
        data = None
        if isinstance(body, dict):
            if isinstance(body.get("generatedPlan"), dict):
                data = body["generatedPlan"]
            elif isinstance(body.get("inputJson"), dict) and isinstance(body["inputJson"].get("generatedPlan"), dict):
                data = body["inputJson"]["generatedPlan"]
        if not isinstance(data, dict):
            raise HTTPException(status_code=400, detail="Body must contain generatedPlan or inputJson.generatedPlan")
        result = await generate_end_to_end_itinerary(data)
        return result
    except HTTPException:
        raise
    except ValueError as ve:
        msg = str(ve) or "Upstream model returned empty or invalid JSON"
        logger.warning("/itinerary bad upstream JSON: %s", msg)
        raise HTTPException(status_code=502, detail=msg)
    except Exception as e:
        msg = str(e) or "Internal error while generating itinerary"
        logger.exception("/itinerary failed: %s", msg)
        raise HTTPException(status_code=500, detail=msg)
