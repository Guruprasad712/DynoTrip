# Trip Planner App (Full project)

This is a full Next.js (App Router) project scaffold for the Trip Planner app.
It includes:
- `app/` folder (UI, pages, context, components)
- `pages/api/` endpoints (itinerary stub and saveBooking using Firebase Admin)
- `lib/` helpers

## Quick start
1. Copy the repo to your machine (this folder is ready).
2. Rename `.env.local.example` to `.env.local` and fill keys.
3. Install dependencies:
   npm install
4. Run dev server:
   npm run dev
5. Open http://localhost:3000

## Notes
- Sensitive keys (Firebase admin JSON, Vertex API keys) must be set in environment only.
- Components that need browser APIs are marked with `use client`.
- If you run into issues, check console logs for server endpoints (/api/*).
