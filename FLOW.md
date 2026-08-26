# FLOW

**This file is for the agent.** Describe how the web app actually runs. Update it whenever the path between UI, API, and data changes.

## Processes (dev)

```
Browser  :5173  →  Vite (React)  ──proxy /api──►  FastAPI :8000  ──►  MongoDB :27017
                                      │
                                      └── Excalidraw lives only in the browser
```

1. `docker compose up mongo` — database (optional until save exists).
2. `uvicorn` in `backend/` — API.
3. `npm run dev` in `frontend/` — UI.

## User loop (target, once canvas is wired)

1. User draws on Excalidraw (freehand, boxes, arrows).
2. User **selects** one or more elements (click / shift-click / drag).
3. User hits a toolbar button **or** holds the mic and says an English command (`perfect`, `align left`, …).
4. Frontend reads `selectedElementIds`. Empty → toast “Select a shape first” and stop.
5. Frontend runs the matching operation on those elements only (perfect / align / …).
6. Excalidraw `updateScene` commits the change (undo works).
7. Optional later: `POST /api/scenes` stores the scene JSON in Mongo. Not required for the demo to work.

## Voice

```
Mic → Web Speech API (browser) → transcript string → keyword map → same operation as the button
```

The backend does not hear audio in v1.

## Backend (now)

| Method | Path | Role |
|---|---|---|
| GET | `/api/health` | Liveness; used by the UI status chip |
| GET | `/api/scenes` | Stub: list saved scenes (empty until persist exists) |

## Where a bug might live

| Symptom | Look first |
|---|---|
| Canvas missing / tools broken | `frontend/src` Excalidraw mount |
| Button does nothing | Selection empty vs operation code |
| Mic does nothing | Browser (Chrome), permissions, Web Speech |
| UI “API down” | FastAPI not running; CORS; Vite proxy |
| Save fails (later) | Mongo not up; `MONGODB_URI` |
