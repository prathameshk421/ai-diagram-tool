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

Voice-driven **architecture board**. Speak or type a short command. Groq Whisper transcribes. The host `runPipeline` orchestrator then runs injectable enhance → judge → command **or** build/plan tools. Production injects `runEnhancer` and `runJudge` (OmniRoute JSON; host `bindReferents` after the enhancer). Remaining commands without a valid `enhance.command` still go to OmniRoute OpenCode Go DeepSeek (no keyword table). **`applyEditPlan` is the write API.** The scene is `arch-scene/v1` (`diagram.arch.json` in `localStorage`): the agent patches semantics; the kernel owns pins, sizes, and routes. Humans draw, select, and drag on an SVG board.

Command JSON `{op, args, confidence, say}` is still the LLM output for the original ops (`desugarCommand` → `applyEditPlan`). Build/plan emit `EditToolCall[]`. Questions, undo, asks, and paste/zoom are host channels and must not dirty the file SHA. Clarifications use `ClarifyPanel`, not toast-only. Verify is `verifyEdit` predicates + tool trace — never a screenshot or vision model.

## Stack

- **Current app:** React + Vite + TypeScript at the **repo root** (`src/`, `src/scene/`, `src/canvas/`, `server/proxy.ts`). `npm run dev` here.
- **STT:** Groq `whisper-large-v3-turbo` via same-origin `POST /api/transcribe`. No Web Speech.
- **Intent:** OmniRoute `POST /api/intent` → `{base}/v1/chat/completions` via `requestChatRole` (enhancer, judge, command, build, plan). Default `opencode-go/deepseek-v4-flash`. No keyword parser.
- **Write API:** `applyEditPlan` (`src/agent/edit/`). Never send screenshots to the model. Verify is scene predicates (`src/agent/verify/`).
- **Scene:** `arch-scene/v1` in `src/scene/`. Validator + passes + constraints + layout. Persist JSON (YAML-shaped types; no yaml dependency).
- **Board:** SVG in `src/canvas/`. Not Excalidraw. Human drag writes `pin` only. Camera pan/zoom is not stored.
- **Keys:** Settings / `localStorage` only. The Vite proxy must **not** read `process.env`. Live tests (`npm run test:live`) may read `GROQ_API_KEY` and `OMNIROUTE_API_KEY` in the test runner.
- **Later layout only:** `frontend/`, `backend/`, `firebase/` came from `main`. Do not treat them as the running app. Do not wire Excalidraw or Web Speech.

## Do

- Typed and spoken commands go through `runPipeline` (`src/agent/pipeline/orchestrator.ts`) except host undo. Production injects `runEnhancer` + `runJudge` + `resolveCommand`/`requestIntent` + `runBuild` + `runPlan` + `verifyEdit`. Valid `enhance.command` skips `requestCommand`. Do not add a keyword/regex shortcut for align/perfect/etc. Never keyword-route ops. Host `bindReferents` runs after the enhancer LLM. Judge never defaults to `plan` on LLM failure (fallback is `command`).
- `applyEditPlan` is the write API. Never send screenshots or camera images to the model. Verify is `verifyEdit` scene predicates + tool trace, not vision.
- Capture `sceneHash` at pipeline start. If `getLiveHash()` / `liveHash` differs before apply → no write, say `"Board changed — try again."`. Abort or 500 from a role → no write, unknown.
- Pipeline asks set `pendingAsk` and `ClarifyPanel` (including deictic/host `applyTurn.ask`). At most one `status: "ask"` per `runPipeline` invocation. Disable Run / Talk / Undo (and ignore ⌘Z) while the pipeline is running (not idle/asking).
- Commit the pipeline scene with `sceneAfterPipeline(live, out)`: only `wrote` results replace the live board.
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
src/                 Harness UI + STT + intent
src/agent/pipeline/  runPipeline session + orchestrator (injectable roles)
src/agent/roles/     enhancer, judge, build, plan, reviewPlan (OmniRoute JSON + host bindReferents)
src/agent/edit/      applyEditPlan tools (write API)
src/agent/verify/    verifyEdit scene predicates (not vision)
src/scene/           arch-scene/v1 kernel (validate, passes, constraints, turn)
src/canvas/          SVG board (human draw / select / drag)
src/chrome/          CommandInput, ClarifyPanel, StatusBar, previews
server/              Same-origin Groq + OmniRoute proxy
tests/               Vitest (mock) + tests/live (requires keys) + tests/scene + tests/agent
docs/                Feature contract + implementation plan + canvas research
frontend/            Later canvas sketch from main — not this app
backend/             FastAPI health from main — not this app
firebase/            Hosting/rules sketch from main — not this app
```
