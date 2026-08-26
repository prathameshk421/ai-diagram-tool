# ai-diagram-tool

Voice-driven architecture-diagram **agent path**: Groq Whisper transcribes; OmniRoute OpenCode Go DeepSeek always interprets the text and emits closed Command JSON. No keyword table. No drawing surface in this slice.

- Feature contract: [docs/features.md](docs/features.md)
- Implementation plan: [docs/implementation-plan.md](docs/implementation-plan.md)

**This slice ships:** harness UI + Groq STT + OmniRoute intent. A later canvas will consume the same Command as agent tools against an agent-optimized scene.

Keys are pasted in Settings. No env-key fallback. No Web Speech. Thinking is off. Every command hits the LLM.

## Run

```bash
npm install
npm test          # unit tests; no API keys
npm run test:live # requires GROQ_API_KEY and OMNIROUTE_API_KEY
npm run dev
```

`npm run test:live` probes Groq `/openai/v1/models` and OmniRoute `/api/rate-limits` first, then makes **one** Whisper request and **one** chat completion. It does not retry HTTP 429.

Open `http://localhost:5173`. Paste Groq + OmniRoute keys in Settings. Type `align left` to see Command JSON from DeepSeek.

## Settings

| Field | Default |
|---|---|
| OmniRoute URL | `http://localhost:20128` |
| OmniRoute API key | empty |
| Groq API key | empty |
| LLM model | DeepSeek Flash (`opencode-go/deepseek-v4-flash`) |

Wire OpenCode Go DeepSeek in the OmniRoute dashboard. This app does not install OpenCode.

## curl

```bash
# Missing Groq key → 401 even if GROQ_API_KEY is in the shell
export GROQ_API_KEY=must-not-be-used
curl -sS http://localhost:5173/api/transcribe
# {"error":"missing_groq_key"}
```

## Later layout (from `main`, not this slice)

`frontend/`, `backend/`, and `firebase/` are a later canvas / hosting sketch. They are **not** the running app. Do not `cd frontend` or use Web Speech for this slice. The current app is the repo-root Vite harness above.
