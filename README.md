# DynoTrip
AI-powered trip planner for the Google Cloud hackathon.

## Project Structure
- `backend/` — FastAPI service that calls Gemini/Vertex AI via `google-genai` and uses MCP tools (Google ADK) for travel, stay, and itinerary generation.
- `frontend/` — Next.js (App Router) UI with Material UI. Includes local mock API routes under `pages/api/mcp/` so the app can run without the backend.

## Quick Start (Frontend with Mocks)
This mode requires no backend or keys and is suitable for demo/evaluation.

1. Open a terminal in `frontend/`
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`
4. Open http://localhost:3000

The UI will use the mock endpoints in `frontend/pages/api/mcp/` to provide a full flow (travel, stay, itinerary) without real MCP or Gemini.

## Full Stack Run (Requires MCP + Gemini/Vertex)
If you’d like to run the real generation endpoints, set up the backend and MCP tools server.

### Backend
- Create `backend/.env` from `backend/env.example` and fill values:
  - `MCP_SERVER_URL` (e.g., `http://127.0.0.1:9000/mcp`)
  - `GEMINI_API_KEY` or Vertex ADC variables (`PROJECT_ID`, `VERTEX_AI_LOCATION`)
  - If using service account, set `GOOGLE_APPLICATION_CREDENTIALS` path
- Install deps: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.api.app:app --reload --port 8000`
- Health check: `GET http://localhost:8000/health`

### Frontend
- Create `frontend/.env.local` from `frontend/env.local.example`
- Set `NEXT_PUBLIC_MCP_PLAN=http://localhost:8000/travel-stay`
- Install & run:
  - `npm install`
  - `npm run dev`

Optionally wire itinerary endpoints by modifying the mock API routes to proxy to:
- `POST /itinerary-from-selections`
- `POST /itinerary`

## Security & Submission Notes
- Do NOT commit secrets. Replace real env files with examples:
  - Backend: `backend/env.example` → copy to `.env` locally
  - Frontend: `frontend/env.local.example` → copy to `.env.local` locally
- The repo has a root `.gitignore` to exclude common secrets and heavy artifacts.
- Before submission, remove:
  - `backend/.env`, any credentials under `backend/keys/`
  - Local envs: `.venv/`, `backend/venv/`
  - Frontend build artifacts: `frontend/node_modules/`, `frontend/.next/`
- If any keys were previously committed, revoke and rotate them immediately.

## Backend Endpoints (when enabled)
- `POST /travel-stay` — Generate travel + stay JSON from user preferences
- `POST /itinerary-from-selections` — Generate itinerary using user-selected travel/stay
- `POST /itinerary` — Refine an end-to-end itinerary from a previous plan

## Frontend Key Files
- `app/page.tsx` — Landing form that calls MCP plan endpoint or local mock
- `app/dashboard/context/TripContext.tsx` — In-memory + localStorage store with seed/mocks
- `pages/api/mcp/*` — Mock API endpoints for demo mode

## License
For hackathon evaluation use only.
