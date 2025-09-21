# DynoTrip — Hackathon Submission Prep Checklist

Use this checklist to sanitize the repository before submission. Do not include secrets, machine-specific files, or heavy build artifacts.

## Must remove (if present)
- backend/.env (contains secrets) — REVOKE and ROTATE any keys already exposed
- backend/keys/ (service account json keys)
- .venv/ and backend/venv/ (local virtualenvs)
- node_modules/ (judges can install via npm install)
- frontend/.next/ (Next.js build output)
- Any *.log, coverage/, dist/, build/

## Keep
- backend/requirements.txt
- backend/api/, backend/services/, backend/templates/
- frontend/app/, frontend/pages/, frontend/lib/, frontend/package.json, frontend/tsconfig.json, frontend/next.config.js
- Root .gitignore
- This SUBMISSION_PREP.md

## Environment files to provide as examples (already added)
- backend/env.example — copy to backend/.env locally
- frontend/env.local.example — copy to frontend/.env.local locally

## Suggested cleanup commands (Windows PowerShell)
# Review before running. These delete local artifacts/secrets from the working tree.
```powershell
# 1) Remove virtual environments
Remove-Item -Recurse -Force .venv -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend/venv -ErrorAction SilentlyContinue

# 2) Remove Node/Next.js build output
Remove-Item -Recurse -Force frontend/node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force frontend/.next -ErrorAction SilentlyContinue

# 3) Remove logs and common build dirs
Get-ChildItem -Recurse -Include *.log | Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force dist, build, coverage -ErrorAction SilentlyContinue

# 4) Remove secrets (DO NOT SUBMIT!)
Remove-Item -Force backend/.env -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend/keys -ErrorAction SilentlyContinue
```

## How judges can run
- Frontend only (mocks):
  - cd frontend
  - npm install
  - npm run dev
  - Open http://localhost:3000
  - This uses local mock API routes under `frontend/pages/api/mcp/*` — no backend required.

- Full stack (requires MCP tools server + Gemini/Vertex keys):
  - Backend: create backend/.env from backend/env.example and fill values
    - Start: `uvicorn backend.api.app:app --reload --port 8000`
  - Frontend: set NEXT_PUBLIC_MCP_PLAN=http://localhost:8000/travel-stay in frontend/.env.local
    - Start: `npm run dev`

## Security note
- The repo previously contained a .env with API keys. Immediately revoke and rotate those keys in your cloud provider and Resend.
