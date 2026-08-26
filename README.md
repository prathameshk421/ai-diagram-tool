# ai-diagram-tool

Voice-assisted Excalidraw for **software architecture** diagrams. Sketch, select, then perfect/align (buttons or a mic).

## Layout

| Path | What |
|---|---|
| `frontend/` | React + Vite UI (canvas + toolbar + voice) |
| `backend/` | FastAPI (`/api/health`, scene stubs) |
| `docs/features.md` | Product contract |
| `AGENTS.md` | Rules for coding agents |
| `CHANGELOG.md` / `DECISIONS.md` / `FLOW.md` | Agent-owned: what changed, why, how it runs |

## Dev

Mongo (optional until save exists):

```bash
docker compose up -d mongo
```

API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

UI:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — `/api` is proxied to FastAPI.

## v1 slice

Perfect selected ink, align selected boxes, refuse if nothing is selected, optional English voice keywords. See `docs/features.md`.
