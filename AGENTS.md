# Agent instructions

Read this file before changing code.

These repo-root files exist **so the agent can keep the project understandable**. The agent owns them. After every change, update the matching file. Do not leave them stale.

| File | Who updates it | What to write |
|---|---|---|
| `AGENTS.md` | Agent, when rules change | How the next agent should work in this repo |
| `CHANGELOG.md` | **Agent, on every change** | What you just did, newest first |
| `DECISIONS.md` | **Agent, whenever you choose something** | Why this stack, library, test, or design |
| `FLOW.md` | **Agent, whenever wiring changes** | How frontend, backend, and data actually talk |
| `docs/features.md` | Agent only with an explicit product change | Feature contract. Do not contradict it silently |

If you edited code and skipped `CHANGELOG.md`, the change is incomplete. If you picked a database or auth approach and skipped `DECISIONS.md`, the change is incomplete. If you changed a route or how the UI talks to Firebase/FastAPI and skipped `FLOW.md`, the change is incomplete.

## Product (short)

Web app for **software architecture diagrams**. User sketches on Excalidraw, **selects** element(s), then runs an operation (button or English voice). Only the selection is mutated. Geometry is deterministic code, not a vision model.

v1 demo: Perfect (ink → circle/rect/line), Align left/center/top, refuse if nothing is selected, optional mic keywords. Undo = Excalidraw Cmd+Z. Google login + Firestore save for production.

## Stack

- **Frontend:** React + Vite + TypeScript (`frontend/`). Excalidraw React component — do not fork Excalidraw.
- **Auth / data / hosting:** **Firebase** — Google sign-in (Auth), saved scenes (Firestore), production Hosting. No MongoDB.
- **Backend:** FastAPI (`backend/`) for health and later Python helpers. It is **not** the database. Do not add Express unless `DECISIONS.md` says so.
- **Voice v1:** browser Web Speech API in the frontend. No Whisper, Rumik, or LLM in v1.

## Do

- Operate only on `selectedElementIds`. If the selection is empty, refuse and toast. Do not guess the target.
- Put shape-fitting and align math in the frontend (`frontend/src/lib/` when it exists). Backend is not the geometry engine for v1.
- Keep mutations in Excalidraw history so undo works.
- Scene JSON for signed-in users goes to **Firestore**, not FastAPI. Debounce writes. Stay on Spark while testing.
- After a change: append `CHANGELOG.md`. If you chose something, add a section to `DECISIONS.md`. If you changed how pieces connect, edit `FLOW.md`.
- Commit as the repo owner identity when the user asks for that. Do not attribute work to Cursor Agent.

## Do not

- Generate a whole diagram from a long prompt (YapDraw-style).
- Add a text-to-diagram mode.
- Use a vision model to “pretty up” ink.
- Call a hosted STT/TTS API in v1.
- Relayout or delete unselected elements.
- Store a whole huge Excalidraw scene in one Firestore doc if it may exceed **1 MB** — split later if needed.
- Put Firebase private keys in git. Public web config (`apiKey`, `authDomain`, …) lives in `frontend/.env.example` as placeholders; real values in `.env` (gitignored).
- Bring MongoDB or `docker-compose` database containers back without a new decision.

## Layout

```
frontend/     React app (UI + canvas + voice + Google login)
backend/      FastAPI (health only for now)
firebase/     Firestore rules / hosting config
docs/         Product spec
AGENTS.md     Rules for the next agent (this file)
CHANGELOG.md  Agent-maintained: what changed
DECISIONS.md  Agent-maintained: why
FLOW.md       Agent-maintained: how it runs
```

Frontend talks to Firebase Auth/Firestore directly. FastAPI is optional (`/api/health` via Vite proxy in dev).
