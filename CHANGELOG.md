# CHANGELOG

Newest first. **This file is for the agent.** Append an entry on every repo change.

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
