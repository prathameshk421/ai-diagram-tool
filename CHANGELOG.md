# CHANGELOG

Newest first. **This file is for the agent.** Append an entry on every repo change.

## 2026-08-26 — Canvas research (agent-optimized scene)

- Added `docs/canvas-agent-research.md`: papers and a DIY map for a later canvas.
- Recommended split: logical graph + constraints + solved AABBs; LLM keeps Command ops, code does the math.
- No board, geometry, or scene persist shipped. Pointers in `AGENTS.md`, `DECISIONS.md`, `docs/features.md` §7, README.

## 2026-08-26 — Pure AI intent (no keyword table)

- Deleted `keywordParser`. Every typed or spoken command goes to OmniRoute DeepSeek.
- Missing OmniRoute URL/key → toast, no regex fallback.
- Type-in now needs an OmniRoute key, same as paraphrases.

## 2026-08-26 — Merge main; agent path wins

- Merged `main` (web layout + agent tracking docs).
- Resolved README / `docs/features.md` for the **agent-path** harness (Groq + OmniRoute, no board). This matches the locked chat/plan, not the Excalidraw + Web Speech v1 on `main`.
- Kept `frontend/`, `backend/`, `firebase/` as later-layout files. They are not the running app.
- Pointed `AGENTS.md`, `DECISIONS.md`, and `FLOW.md` at the repo-root harness.

## 2026-08-26 — Firebase instead of Mongo

- Auth / data / hosting is **Firebase** (Google login, Firestore, Hosting). Mongo and `docker-compose` database are gone.
- FastAPI kept for `/api/health` only; scenes are not stored there.
- Updated `docs/features.md`, `AGENTS.md`, `DECISIONS.md`, `FLOW.md`, README, and the frontend sign-in placeholder.

## 2026-08-26 — Uppercase agent docs

- Renamed `agent.md` → `AGENTS.md`.
- Renamed `ChangeLog.md` → `CHANGELOG.md`, `Decisions.md` → `DECISIONS.md`, `Flow.md` → `FLOW.md`.
- Spelled out in `AGENTS.md` that those files are agent-owned and must be updated with every change.

## 2026-08-26 — Web app layout

- Scaffolded a React (Vite) frontend and FastAPI backend.
- Added MongoDB via `docker-compose.yml`.
- Added `AGENTS.md`, `CHANGELOG.md`, `DECISIONS.md`, and `FLOW.md`.
- Placeholder UI: toolbar, canvas stage, voice bar. Excalidraw not wired yet.
- Health endpoint `GET /api/health` on the backend.
