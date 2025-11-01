#!/bin/bash
set -e

echo "Starting MCP on 8081..."
python /app/agents/itinerary_agent/utils/agent.py &

echo "Starting API on ${PORT:-8080}..."
uvicorn api.app:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --log-level info

# When uvicorn exits, stop everything
kill 0
