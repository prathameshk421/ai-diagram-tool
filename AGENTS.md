# Agent instructions

Read this file before changing code.

These repo-root files exist **so the agent can keep the project understandable**. The agent owns them. After every change, update the matching file. Do not leave them stale.

| File | Who updates it | What to write |
|---|---|---|
| `AGENTS.md` | Agent, when rules change | How the next agent should work in this repo |
| `CHANGELOG.md` | **Agent, on every change** | What you just did, newest first |
| `DECISIONS.md` | **Agent, whenever you choose something** | Why this stack, library, test, or design |
| `FLOW.md` | **Agent, whenever wiring changes** | How the harness, proxies, and APIs talk |
| `docs/features.md` | Agent only with an explicit product change | Feature contract. Do not contradict it silently |
| `docs/implementation-plan.md` | Agent only when the user asks to edit the plan | Locked STT/intent plan (canvas contract lives in `docs/features.md`) |

If you edited code and skipped `CHANGELOG.md`, the change is incomplete. If you picked a provider, model, or key path and skipped `DECISIONS.md`, the change is incomplete. If you changed a route or how the UI talks to Groq/OmniRoute and skipped `FLOW.md`, the change is incomplete.

## Product (this slice)

Voice-driven **architecture board**. Speak or type a short command. Groq Whisper transcribes. OmniRoute OpenCode Go DeepSeek always interprets the text (no keyword table). The write path is an `arch-scene/v1` scene (`diagram.arch.json` in `localStorage`): the agent patches semantics; the kernel owns pins, sizes, and routes. Humans draw, select, and drag on an SVG board.

Command JSON `{op, args, confidence, say}` is still the LLM output for the original ops. The kernel maps those ops onto the scene. Questions, undo, and paste/zoom are host channels and must not dirty the file SHA.

## Stack

- **Current app:** React + Vite + TypeScript at the **repo root** (`src/`, `src/scene/`, `src/canvas/`, `server/proxy.ts`). `npm run dev` here.
- **STT:** Groq `whisper-large-v3-turbo` via same-origin `POST /api/transcribe`. No Web Speech.
- **Intent:** OmniRoute `POST /api/intent` → `{base}/v1/chat/completions` for every command. Default `opencode-go/deepseek-v4-flash`. No keyword parser.
- **Scene:** `arch-scene/v1` in `src/scene/`. Validator + passes + constraints + layout. Persist JSON (YAML-shaped types; no yaml dependency).
- **Board:** SVG in `src/canvas/`. Not Excalidraw. Human drag writes `pin` only. Camera pan/zoom is not stored.
- **Keys:** Settings / `localStorage` only. The Vite proxy must **not** read `process.env`. Live tests (`npm run test:live`) may read `GROQ_API_KEY` and `OMNIROUTE_API_KEY` in the test runner.
- **Later layout only:** `frontend/`, `backend/`, `firebase/` came from `main`. Do not treat them as the running app. Do not wire Excalidraw or Web Speech.

## Do

- Always send the transcript to OmniRoute (except host channels: undo / put it back). Do not add a keyword/regex shortcut for align/perfect/etc.
- Send `"thinking": { "type": "disabled" }`. Never `thinking: false`. HTTP 400 → omit `thinking` once.
- Reject coordinate keys from the LLM and from agent JSON Patch (`pin.x`, `width`, `height`, `ink.points`).
- Empty transcript or `no_speech_prob >= 0.6` skips intent.
- Empty `selection` + deictic prompt (`this`, `these`) → no write, ask.
- `beautify` always freezeTopology + freezeSemantics + freezePins (restyle in place).
- `insert` splices the edge; do not leave a sidecar `A→B`.
- Questions → SHA of the scene unchanged.
- After a change: append `CHANGELOG.md`. If you chose something, add a section to `DECISIONS.md`. If you changed how pieces connect, edit `FLOW.md`.

## Do not

- Dump Excalidraw JSON into the model, or let the agent invent `x,y`.
- Use Web Speech, env-key fallback on the proxy, or OpenCode CLI / `opencode.json`.
- Retry OmniRoute on 500. Live tests must not retry HTTP 429.
- Generate a whole diagram from a long prompt or photo.
- Use a vision model to “pretty up” ink. No OCR, no color targeting.
- Treat `beautify` as AWS restyle or as type promotion.
- Split a node without named edges. Duplicate a board beside the original.
- Contradict `docs/features.md` silently.

## Layout

```
src/          Harness UI + STT + intent
src/scene/    arch-scene/v1 kernel (validate, passes, constraints, turn)
src/canvas/   SVG board (human draw / select / drag)
server/       Same-origin Groq + OmniRoute proxy
tests/        Vitest (mock) + tests/live (requires keys) + tests/scene
docs/         Feature contract + implementation plan + canvas research
frontend/     Later canvas sketch from main — not this app
backend/      FastAPI health from main — not this app
firebase/     Hosting/rules sketch from main — not this app
```
