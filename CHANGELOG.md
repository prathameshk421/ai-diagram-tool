# CHANGELOG

Newest first. **This file is for the agent.** Append an entry on every repo change.

## 2026-08-26 — Build agent and deterministic scene verify

- `runBuild` / `parseBuild` call `requestChatRole` role `build` with `BUILD_PROMPT` and `projectForAgentSafe(scene)`. Invalid JSON, unknown tools, geometry keys (`pin`/`x`/`y`/…), >8 calls, and HTTP 500 fail closed (empty calls, no write, no retry). Missing OmniRoute key asks without fetch.
- `verifyEdit` is scene predicates + tool trace (no vision, no LLM). Insert must splice (fail `INSERT_SIDECAR`); beautify must freeze ids/kinds/pins; tool args must not leak coordinates.
- Orchestrator build route: up to `TURN_CAPS.maxVerifyAttempts` (2) of build → `applyEditPlan` → verify. Failures pass `errors` back into the next build payload. Exhaustion rolls back to the original scene (`wrote: false`). Ask remediation and apply-plan ask skip the rebuild loop.
- App `pipelineDeps` injects `runBuild` and `verifyEdit`. Plan/review agents still absent.

## 2026-08-26 — Enhancer and judge roles with host resolveReferent

- `runEnhancer` / `runJudge` call `requestChatRole` and parse JSON. Invalid JSON and HTTP 500 fail closed (enhancer refuse unknown; judge `route: "command"` — never plan).
- Host `bindReferents` runs **after** the enhancer LLM: exact node/edge ids pass through, else `resolveReferent`. Ambiguous Kafka → ask with candidate ids; missing object → ask. Empty OmniRoute key refuses without fetch.
- Enhancer payload is `projectForAgentSafe(scene)` (no pins). Judge payload is scene stats only (node/edge counts), not the full scene.
- Judge overlay: valid `intent.command` forces `command`; `hints.structural` without `multiStep` forces `build` when the LLM said `plan`. Overlay does not regex align/perfect.
- App `pipelineDeps` injects `runEnhancer` / `runJudge` instead of passthrough stubs. Valid `enhance.command` still skips `requestCommand`.

## 2026-08-26 — Ask pending + keep live scene when pipeline does not write

- `applyTurn.ask` (deictic empty selection, host color/split) now returns a synthesized `PendingAsk`, so App opens ClarifyPanel instead of toast-only.
- `sceneAfterPipeline(live, out)` commits `out.scene` only when `out.wrote`; otherwise the live board (human edits during the run) is kept. App uses this helper.

## 2026-08-26 — Pipeline orchestrator, session types, ClarifyPanel

- `runPipeline` in `src/agent/pipeline/orchestrator.ts` is the host turn: host channels skip role LLMs; otherwise injectable `enhance` / `judge` / `requestCommand` / optional `build`. Questions, asks, abort, 500, and hash mismatch never write. Valid `enhance.command` skips `requestCommand`.
- App keeps a pipeline session (stage, pending ask, AbortController, busy mutex). Production deps are passthrough enhance + judge `command` + `resolveCommand`/`requestIntent`. Esc cancels. Undo/Talk/Run are disabled while running.
- `ClarifyPanel` is the ask UI. CommandInput `answer` mode, StatusBar stage copy, CommandPreview pipeline JSON, Board amber `#f4d58d` candidate halos.

## 2026-08-26 — Agent-safe projection + per-role OmniRoute chat

- `projectForAgentSafe` clones the scene, deletes every `node.pin` and `ink.points`, and attaches `view` computed from the stored scene (so `rel` stays correct). `projectForAgent` is unchanged for ScenePreview (pins may remain).
- `requestChatRole` posts to the same `/api/intent` with per-role `ROLE_BUDGETS` (`src/agent/pipeline/budgets.ts`). Thinking is `{ type: "disabled" }`; HTTP 400 omits thinking once; 500/429 are not retried.
- `requestIntent` is the command role on top of `requestChatRole`: still 4s / 200 tokens and payload `{ transcript, selectionCount, selection }` (no scene).

## 2026-08-26 — applyEditPlan review: add wipe, connect ortho, id clash

- JSON Patch `add` of whole `/nodes` or `/edges` is rejected (same as replace/remove).
- Desugared `connect` passes `route: "ortho"` so Command behavior matches the old adapter.
- `add_node` errors when the proposed id is already in nodes/edges/groups/ink (no clobber, pin preserved).

## 2026-08-26 — Closed applyEditPlan scene edit API

- Agent writes go through typed tools (`src/agent/edit/`) batched by `applyEditPlan`. Failed calls and `compile()` throws roll back to the original scene (SHA unchanged).
- `desugarCommand` maps the original Command ops onto those tools. `applyCommand` / command `applyTurn` share that write path.
- JSON Patch rejects host fields (`selection`, `lastDrawn`, `schema`, `view`), whole `/nodes` or `/edges` replace/remove, and RFC6902 `-`.
- Kernel passes `insertOnPath` / `annotatePath` / `mergeNodes` throw on missing edge, no path, or missing keep (no silent no-op).
- `semanticDiff` reports topology, labels, and kinds only — never coordinates.

## 2026-08-26 — Box labels and pen strokes actually work in the browser

- Drawing a box now opens the label field (type, Enter). Double-click still edits; that path uses `dblclick`, not `pointerdown.detail` (often 0).
- Do not `setPointerCapture` on every pointerdown — that stole clicks from the SVG `foreignObject` input. Capture only once a pan/box/pen/move/marquee drag starts. Skip capture when the target is an input.
- Sub-4px jitter is not a move, so a rename click does not nudge `pin`.
- Pen commits the pointerup point so a stroke with no `pointermove` events still inks (computer-use / sparse events).
- Label input sits in an XHTML wrapper inside `foreignObject`.

## 2026-08-26 — RAG edge cases, whole-board refuse, double-click labels

- Host channel: long “build/generate a … architecture/pipeline” prompts do not write the scene (SHA stable). Color targeting and split-without-edges ask.
- Double-click a box to set `label` (human-owned; no coordinates).
- Kernel tests for a RAG pipeline: insert-on-path cache, beautify freezePins, fan-out that keeps leftover edges, async dashed ingest, annotate-path, whole-board WONTFIX.

## 2026-08-26 — arch-scene/v1 kernel + SVG architecture board

- Locked `arch-scene/v1` in `src/scene/`: schema, validator, RFC6902 patch (rejects coordinates / ink points), passes (beautify with implied freezes, convert-ink same-id, insert-on-path, merge, tidy-layout, unoverlap, restyle-icons, annotate-path), constraints, referent resolver, delete+retarget, SHA-stable question turns, host undo journal.
- SVG board in `src/canvas/`: select / box / pen / connect; human drag writes `pin`; camera pan/zoom is not stored. Replaced the selection-count stub with real `selection[]` ids on the OmniRoute payload. Box/pen commits use pointer coordinates (not React state) so a same-frame drag still creates a node. Undo snapshots live at module scope so Strict Mode remounts do not wipe the stack.
- Command JSON still comes from OmniRoute; `applyTurn` maps it onto the scene. Persist JSON in `localStorage` (`ai-diagram-tool:scene`). Agent projection omits `ink.points` and adds `view`.
- Tests: `tests/scene/*` (illegal writes, selected beautify, empty-selection ask, insert not sidecar, delete retarget, question SHA, AWS restyle freezePins, two-Kafka ask) plus existing intent tests.
- Product docs: canvas is this slice. No Excalidraw, no vision, no whole-board generation.

## 2026-08-26 — Audit utterances 48–76 against arch YAML

- Added `docs/canvas-audit-48-76.md`: WORKS / WORKS_IF / FAILS for targeting, labels, questions, undo, messy voice.
- Scored against surgical `diagram.arch.yaml` edits (kernel geometry, host `selection[]`). No code.
- 1 WORKS / 20 WORKS_IF / 8 FAILS. Hard fails: merge/dedupe, left-Kafka, blue-one, protocol labels, legend, numbered path, duplicate board, hunk undo.
- Pointed `docs/canvas-agent-research.md` at that audit so the nine-op tool list is not read as covering 48–76.

## 2026-08-26 — Pure AI intent (no keyword table)

- Deleted `keywordParser`. Every typed or spoken command goes to OmniRoute DeepSeek.
- Missing OmniRoute URL/key → toast, no regex fallback.
- Type-in now needs an OmniRoute key, same as paraphrases.

## 2026-08-26 — Merge main; agent path wins

- Merged `main` (web layout + agent tracking docs).
- Resolved README / `docs/features.md` for the **agent-path** harness (Groq + OmniRoute, no board). This matches the locked chat/plan, not the Excalidraw + Web Speech v1 on `main`.
- Kept `frontend/`, `backend/`, `firebase/` as later-layout files. They are not the running app.
- Pointed `AGENTS.md`, `DECISIONS.md`, and `FLOW.md` at the repo-root harness.

## 2026-08-26 — Firebase instead of Mongo

- Auth / data / hosting is **Firebase** (Google login, Firestore, Hosting). Mongo and `docker-compose` database are gone.
- FastAPI kept for `/api/health` only; scenes are not stored there.
- Updated `docs/features.md`, `AGENTS.md`, `DECISIONS.md`, `FLOW.md`, README, and the frontend sign-in placeholder.

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
