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

## Later canvas: agent-optimized scene, geometry in code

Research (not shipped): `docs/canvas-agent-research.md`.

The model is bad at constructing coordinates and good at naming relations (AIDL, ASCII-spatial construction gap, LayoutGPT as the *other* fork). This product already rejects coordinate keys, so the canvas should not take LayoutGPT’s “emit CSS boxes” path or tldraw’s “sanitize the model’s x,y”.

Chosen direction when a canvas PR is allowed:

1. **v1 kernel** — closed-form AABB ops for the locked Command list (`align`, `distribute` with even *gaps*, `snap`, scale, `equalize`, `rotate` 90, `perfect`, `connect` as a logical edge). No constraint library.
2. **Agent view** — compact graph: ids minted by code, labels, kinds, relative relations (`left_of`, `connected_to`). Not Excalidraw/tldraw document JSON. Optional tldraw-style focused vs peripheral *tiering*, without coordinate output.
3. **v2** — Cassowary/kiwi only when constraints must survive a later drag.
4. **v3** — Sugiyama via elkjs only for new-node placement or an explicit tidy op (tidy would be a product change).

Not chosen: Penrose energy minimization for interactive edits; binding tools to Excalidraw; `setPosition({x,y})` as a tool.

## What this slice will not do

No board, geometry, scene persist, text-to-diagram, whole-board generation, Rumik/Ira talking companion, OpenCode CLI, env-key proxy, thinking-enabled LLM calls. English commands only.

## Tests

- `npm test`: mocks only; no Groq/OmniRoute network.
- `npm run test:live`: requires `GROQ_API_KEY` (must start with `gsk_`) and `OMNIROUTE_API_KEY`. Probe rate-limit endpoints first. At most one Whisper call and one chat completion. Do not retry 429.
