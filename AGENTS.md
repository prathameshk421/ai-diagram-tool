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
| `docs/implementation-plan.md` | Agent only when the user asks to edit the plan | Locked agent-path plan |
| `docs/canvas-agent-research.md` | Agent, when the canvas/scene design changes | Papers + DIY map for the later agent canvas. Not a feature lock. |

If you edited code and skipped `CHANGELOG.md`, the change is incomplete. If you picked a provider, model, or key path and skipped `DECISIONS.md`, the change is incomplete. If you changed a route or how the UI talks to Groq/OmniRoute and skipped `FLOW.md`, the change is incomplete.

## Product (this slice)

Voice-driven **agent path** for software architecture diagrams. Speak or type a short command. Groq Whisper transcribes. OmniRoute OpenCode Go DeepSeek always interprets the text (no keyword table). Output is closed **Command JSON**. There is **no drawing surface** in this slice.

A later canvas will bind the same Command ops as tools against an agent-optimized scene. That canvas is not this PR. Map for how to build it: `docs/canvas-agent-research.md` (geometry in code, compact graph for the model, no editor dump).

## Stack

- **Current app:** React + Vite + TypeScript at the **repo root** (`src/`, `server/proxy.ts`). `npm run dev` here.
- **STT:** Groq `whisper-large-v3-turbo` via same-origin `POST /api/transcribe`. No Web Speech.
- **Intent:** OmniRoute `POST /api/intent` → `{base}/v1/chat/completions` for every command. Default `opencode-go/deepseek-v4-flash`. No keyword parser.
- **Keys:** Settings / `localStorage` only. The Vite proxy must **not** read `process.env`. Live tests (`npm run test:live`) may read `GROQ_API_KEY` and `OMNIROUTE_API_KEY` in the test runner.
- **Later layout only:** `frontend/`, `backend/`, `firebase/` came from `main`. Do not treat them as the running v1.1 app. Do not wire Excalidraw or Web Speech in this slice.

## Do

- Always send the transcript to OmniRoute. Do not add a keyword/regex shortcut.
- Send `"thinking": { "type": "disabled" }`. Never `thinking: false`. HTTP 400 → omit `thinking` once.
- Reject coordinate keys from the LLM. Empty transcript or `no_speech_prob >= 0.6` skips intent.
- After a change: append `CHANGELOG.md`. If you chose something, add a section to `DECISIONS.md`. If you changed how pieces connect, edit `FLOW.md`.

## Do not

- Embed a drawing canvas, geometry, or scene persist in this slice.
- Use Web Speech, env-key fallback on the proxy, or OpenCode CLI / `opencode.json`.
- Retry OmniRoute on 500. Live tests must not retry HTTP 429.
- Generate a whole diagram from a long prompt.
- Use a vision model to “pretty up” ink.
- Contradict `docs/features.md` silently.

## Layout

```
src/          Harness UI + STT + intent (the current app)
server/       Same-origin Groq + OmniRoute proxy
tests/        Vitest (mock) + tests/live (requires keys)
docs/         Feature contract + implementation plan + canvas research
frontend/     Later canvas sketch from main — not this slice
backend/      FastAPI health from main — not this slice
firebase/     Hosting/rules sketch from main — not this slice
```
