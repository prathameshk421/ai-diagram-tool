# ai-diagram-tool

Voice-driven **architecture board**: Groq Whisper transcribes; a host pipeline (enhancer → judge → Command JSON **or** build/plan tools) talks to OmniRoute. `applyEditPlan` writes the `arch-scene/v1` scene; the kernel owns geometry. Humans draw on an SVG board. No keyword table. No Excalidraw. The model never invents coordinates. Verify is scene predicates, not a vision model.

- Feature contract: [docs/features.md](docs/features.md)
- Implementation plan (STT/intent): [docs/implementation-plan.md](docs/implementation-plan.md)

**This slice ships:** harness UI + Groq STT + OmniRoute intent + scene kernel + SVG board.

Keys are pasted in Settings. Model id is `OMNIROUTE_MODEL` in `.env`. No env-key fallback. No Web Speech. Thinking is off. Every diagram command hits the LLM. Undo is a host snapshot.

## Run

```bash
npm install
npm test          # unit tests; no API keys
npm run test:live # requires GROQ_API_KEY, OMNIROUTE_API_KEY, OMNIROUTE_MODEL
npm run dev
```

`npm run test:live` probes Groq `/openai/v1/models` and OmniRoute `/api/rate-limits` first, then makes **one** Whisper request and **one** chat completion. It does not retry HTTP 429.

Open `http://localhost:5173`. Paste Groq + OmniRoute keys in Settings. Draw a box or use the demo API→Postgres board. Type `align left` (with a selection) to see Command JSON applied as pins.

## Settings

| Field | Default |
|---|---|
| OmniRoute URL | `http://localhost:20128` |
| OmniRoute API key | empty |
| Groq API key | empty |

Model id is `OMNIROUTE_MODEL` in `.env` (no Settings picker). Wire that model in the OmniRoute dashboard.

## curl

```bash
# Missing Groq key → 401 even if GROQ_API_KEY is in the shell
export GROQ_API_KEY=must-not-be-used
curl -sS http://localhost:5173/api/transcribe
# {"error":"missing_groq_key"}
```

## Later layout (from `main`, not this app)

`frontend/`, `backend/`, and `firebase/` are a later hosting sketch. They are **not** the running app. Do not `cd frontend` or use Web Speech. The current app is the repo-root Vite board above.
