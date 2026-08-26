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

If you edited code and skipped `CHANGELOG.md`, the change is incomplete. If you picked FastAPI vs Express (or similar) and skipped `DECISIONS.md`, the change is incomplete. If you changed a route or how the UI calls the API and skipped `FLOW.md`, the change is incomplete.

## Product (short)

Web app for **software architecture diagrams**. User sketches on Excalidraw, **selects** element(s), then runs an operation (button or English voice). Only the selection is mutated. Geometry is deterministic code, not a vision model.

v1 demo: Perfect (ink → circle/rect/line), Align left/center/top, refuse if nothing is selected, optional mic keywords. Undo = Excalidraw Cmd+Z.

## Stack

- **Frontend:** React + Vite + TypeScript (`frontend/`). Excalidraw React component — do not fork Excalidraw.
- **Backend:** FastAPI (`backend/`). Express is not in the repo yet; do not add it unless `DECISIONS.md` says so.
- **Data:** MongoDB (see `docker-compose.yml`). Optional for the canvas demo; required once scenes are saved.
- **Voice v1:** browser Web Speech API in the frontend. No Whisper, Rumik, or LLM in v1.

## Do

- Operate only on `selectedElementIds`. If the selection is empty, refuse and toast. Do not guess the target.
- Put shape-fitting and align math in the frontend (`frontend/src/lib/` when it exists). Backend is not the geometry engine for v1.
- Keep mutations in Excalidraw history so undo works.
- After a change: append `CHANGELOG.md`. If you chose something, add a section to `DECISIONS.md`. If you changed how pieces connect, edit `FLOW.md`.
- Commit as the repo owner identity when the user asks for that. Do not attribute work to Cursor Agent.

## Do not

- Generate a whole diagram from a long prompt (YapDraw-style).
- Add a text-to-diagram mode.
- Use a vision model to “pretty up” ink.
- Call a hosted STT/TTS API in v1.
- Relayout or delete unselected elements.
- Invent Mongo schemas that duplicate the full Excalidraw scene format without a decision.
- Put secrets in git. Use `.env` (gitignored) and `.env.example`.

## Layout

```
frontend/     React app (UI + canvas + voice)
backend/      FastAPI (health, later scene persist)
docs/         Product spec
AGENTS.md     Rules for the next agent (this file)
CHANGELOG.md  Agent-maintained: what changed
DECISIONS.md  Agent-maintained: why
FLOW.md       Agent-maintained: how it runs
```

Frontend talks to FastAPI under `/api` (Vite proxy in dev).
