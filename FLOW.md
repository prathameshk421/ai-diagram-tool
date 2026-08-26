# FLOW

**This file is for the agent.** Describe how the web app actually runs. Update it whenever the path between UI, API, and data changes.

## Processes (dev)

```
Browser  :5173  →  Vite (React)
                      │
                      ├── Excalidraw (canvas, selection, undo)
                      ├── Firebase Auth (Google sign-in)
                      ├── Cloud Firestore (saved scenes, per user)
                      └── optional proxy /api  →  FastAPI :8000  (health only)
```

1. `npm run dev` in `frontend/` — UI.
2. `uvicorn` in `backend/` — optional health API.
3. Copy `frontend/.env.example` → `frontend/.env` with a real Firebase web config when you want login/save.

No Docker database. No Mongo.

## User loop (target, once canvas is wired)

1. Optional: **Sign in with Google**.
2. User draws on Excalidraw (freehand, boxes, arrows).
3. User **selects** one or more elements.
4. User hits a toolbar button **or** holds the mic and says an English command (`perfect`, `align left`, …).
5. Frontend reads `selectedElementIds`. Empty → toast “Select a shape first” and stop.
6. Frontend runs the matching operation on those elements only.
7. Excalidraw `updateScene` commits the change (undo works).
8. If signed in: debounce-write scene JSON to Firestore under `users/{uid}/scenes/{id}`.

## Voice

```
Mic → Web Speech API (browser) → transcript string → keyword map → same operation as the button
```

Firebase does not hear audio in v1.

## Auth and data

| Piece | Where |
|---|---|
| Google login | Firebase Auth, popup/redirect from the React app |
| Scene documents | Firestore; security rules: only the signed-in uid |
| Production static app | Firebase Hosting (`firebase.json`) |
| FastAPI | `GET /api/health` only for now |

## Where a bug might live

| Symptom | Look first |
|---|---|
| Canvas missing / tools broken | `frontend/src` Excalidraw mount |
| Button does nothing | Selection empty vs operation code |
| Mic does nothing | Browser (Chrome), permissions, Web Speech |
| Sign-in fails | `frontend/.env` Firebase keys; Google provider enabled in console; authorized domain |
| Save fails | Not signed in; Firestore rules; scene > 1 MB |
| UI “API down” | FastAPI not running (optional); CORS; Vite proxy |
