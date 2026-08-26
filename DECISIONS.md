# DECISIONS

**This file is for the agent.** Record why a stack, library, test, or design was chosen. Add a section whenever you decide something non-obvious.

## Product domain

Software / system architecture diagrams (system design, AI/ML pipelines, cloud infra). Not building floor plans.

## This slice: agent path, no board

Voice → Groq Whisper → OmniRoute OpenCode Go DeepSeek → Command JSON preview. **No drawing surface.** A later canvas will expose these ops as agent tools against an agent-optimized scene, not a raw editor dump.

The first harness used a keyword table so “align left” skipped the model. The owner asked to drop that and keep intent **pure AI**. Known phrases and paraphrases both hit DeepSeek.

## Stack: root Vite harness + Groq + OmniRoute

| Piece | Choice | Why |
|---|---|---|
| App | React + Vite at repo root | Harness UI only; no editor package |
| STT | Groq `whisper-large-v3-turbo` | Hosted Whisper; filename must have an extension; `verbose_json` |
| Intent | OmniRoute DeepSeek Flash (Pro via Settings) on every command | No keyword/regex table; `"thinking": { "type": "disabled" }` |
| Keys | Settings / `localStorage` | Proxy must not read `process.env` |
| Tests | Vitest mocks + optional `npm run test:live` | Unit tests need no keys; live tests require keys and refuse 429 retries |

## What `frontend/`, `backend/`, `firebase/` are

They landed from `main` as a later canvas / Firebase hosting sketch (Google login, Firestore, FastAPI `/api/health`). They are **not** the current app. Do not run `cd frontend` for this slice. Do not reintroduce Web Speech or an editor board until a later canvas PR.

## What this slice will not do

No board, geometry, scene persist, text-to-diagram, whole-board generation, Rumik/Ira talking companion, OpenCode CLI, env-key proxy, thinking-enabled LLM calls. English commands only.

## Tests

- `npm test`: mocks only; no Groq/OmniRoute network.
- `npm run test:live`: requires `GROQ_API_KEY` (must start with `gsk_`) and `OMNIROUTE_API_KEY`. Probe rate-limit endpoints first. At most one Whisper call and one chat completion. Do not retry 429.
