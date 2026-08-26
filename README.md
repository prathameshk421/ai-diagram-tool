# ai-diagram-tool

Voice-assisted Excalidraw for **software architecture** diagrams. Sketch, select, then perfect/align (buttons or a mic). Sign in with Google to save. Deploy on Firebase Hosting.

## Layout

| Path | What |
|---|---|
| `frontend/` | React + Vite UI (canvas + toolbar + voice + Google login) |
| `backend/` | FastAPI (`/api/health` only; not the database) |
| `firebase/` | Firestore rules + hosting config |
| `docs/features.md` | Product contract |
| `AGENTS.md` | Rules for coding agents |
| `CHANGELOG.md` / `DECISIONS.md` / `FLOW.md` | Agent-owned: what changed, why, how it runs |

## Dev

UI:

```bash
cd frontend
cp .env.example .env   # paste Firebase web config
npm install
npm run dev
```

Open http://localhost:5173.

Optional Python health API:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Vite proxies `/api` to FastAPI. Login and saves go to **Firebase**, not FastAPI.

## Firebase console (once)

1. Create a project, Spark plan is fine for testing.
2. Enable **Authentication → Google**.
3. Create **Firestore**.
4. Add the web app; copy config into `frontend/.env`.
5. Deploy: `firebase deploy` (Hosting + rules).

## v1 slice

Perfect selected ink, align selected boxes, refuse if nothing is selected, optional English voice keywords, Google login for production saves. See `docs/features.md`.
