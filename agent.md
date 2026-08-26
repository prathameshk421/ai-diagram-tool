# Agent instructions

Read these before changing code. Keep them current when the project changes.

| File | When to touch it |
|---|---|
| `docs/features.md` | Product contract. Do not contradict it without recording a decision. |
| `ChangeLog.md` | **Every** code or docs change. Append what you did. |
| `Decisions.md` | Why a stack, library, test, or architecture choice was made. |
| `Flow.md` | How frontend, backend, and data actually talk. Update when that changes. |

## Product (short)

Web app for **software architecture diagrams**. User sketches on Excalidraw, **selects** element(s), then runs an operation (button or English voice). Only the selection is mutated. Geometry is deterministic code, not a vision model.

v1 demo: Perfect (ink → circle/rect/line), Align left/center/top, refuse if nothing is selected, optional mic keywords. Undo = Excalidraw Cmd+Z.

## Stack

- **Frontend:** React + Vite + TypeScript (`frontend/`). Excalidraw React component — do not fork Excalidraw.
- **Backend:** FastAPI (`backend/`). Express is not in the repo yet; do not add it unless `Decisions.md` says so.
- **Data:** MongoDB (see `docker-compose.yml`). Optional for the canvas demo; required once scenes are saved.
- **Voice v1:** browser Web Speech API in the frontend. No Whisper, Rumik, or LLM in v1.

## Do

- Operate only on `selectedElementIds`. If the selection is empty, refuse and toast. Do not guess the target.
- Put shape-fitting and align math in the frontend (`frontend/src/lib/` when it exists). Backend is not the geometry engine for v1.
- Keep mutations in Excalidraw history so undo works.
- After a change: update `ChangeLog.md`. If you chose something, add a row to `Decisions.md`. If you changed how pieces connect, edit `Flow.md`.
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
ChangeLog.md  What changed
Decisions.md  Why
Flow.md       How it runs
```

Frontend talks to FastAPI under `/api` (Vite proxy in dev).
