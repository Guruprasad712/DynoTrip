import os
import json
from typing import Any, Dict, Optional
from dotenv import load_dotenv
from fastmcp import Client

try:
    from fastmcp.client.transports import StreamableHttpTransport  # type: ignore
except Exception:
    StreamableHttpTransport = None  # type: ignore

from google import genai

load_dotenv()

# quiet noisy logs
import logging
logging.getLogger("google.genai").setLevel(logging.ERROR)
logging.getLogger("fastmcp").setLevel(logging.ERROR)

# Create a reusable MCP client (HTTP preferred)
def get_mcp_client() -> Optional[Client]:
    mcp_client = None
    url = os.getenv("MCP_SERVER_URL")
    if url and StreamableHttpTransport is not None:
        try:
            transport = StreamableHttpTransport(url=url)
            mcp_client = Client(transport=transport)
        except Exception:
            mcp_client = None
    return mcp_client

# Create a reusable Gemini client
# Prefer API key when available; otherwise fall back to Vertex AI (ADC)
_MODEL = os.getenv("VERTEX_AI_MODEL", "gemini-2.5-flash")
_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VERTEX_API_KEY")
if _API_KEY:
    _gemini_client = genai.Client(api_key=_API_KEY)
else:
    _gemini_client = genai.Client(
        vertexai=True,
        project=os.getenv("PROJECT_ID"),
        location=os.getenv("VERTEX_AI_LOCATION", "us-central1"),
    )


def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return "{}"


def extract_all_text(resp) -> str:
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
    # Ensure we always return a string, even if resp.text is None or non-string
    try:
        fallback = getattr(resp, "text", "")
    except Exception:
        fallback = ""
    return fallback if isinstance(fallback, str) else str(fallback)


def parse_json_response(resp) -> Dict[str, Any]:
    # Try parsed schema first if available
    if getattr(resp, "parsed", None) is not None:
        try:
            return json.loads(json.dumps(resp.parsed))
        except Exception:
            pass
    # Fallback: extract text and parse JSON object
    text = extract_all_text(resp)
    if not isinstance(text, str):
        text = str(text or "")
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start:end+1])
    # As last resort, try direct json
    return json.loads(text)


def llm_json_with_tools(prompt: str, response_schema: Any = None, timeout: int = 300) -> Dict[str, Any]:
    mcp_client = get_mcp_client()
    if mcp_client is None:
        # If MCP server not reachable, raise explicit error (endpoints require tools)
        raise RuntimeError("MCP server not available. Ensure agents/itinerary_agent/utils/agent.py is running and MCP_SERVER_URL is set.")

    async def _run():
        async with mcp_client:
            cfg = genai.types.GenerateContentConfig(
                tools=[mcp_client.session],
                response_mime_type="application/json",
            )
            if response_schema is not None:
                cfg.response_schema = response_schema
            resp = await _gemini_client.aio.models.generate_content(
                model=_MODEL,
                contents=prompt,
                config=cfg,
            )
            return parse_json_response(resp)

    import asyncio
    return asyncio.get_event_loop().run_until_complete(asyncio.wait_for(_run(), timeout=timeout))
