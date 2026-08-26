# DECISIONS

**This file is for the agent.** Record why a stack, library, test, or design was chosen. Add a section whenever you decide something non-obvious.

## Model id is OMNIROUTE_MODEL from .env; Settings has no picker

The intent `model` field is `OMNIROUTE_MODEL` only — a provider/model id, not a vendor brand in Settings. Vite inlines it at dev/build (`import.meta.env.OMNIROUTE_MODEL`). Live tests require the same env var. The proxy still must not read API keys from `process.env`. Stale `omnirouteModel` in localStorage is ignored.

## Talk and type-in share submitTranscript; Use selection is App chrome

Talk after a successful STT must not call `executePipeline` directly. `runPipeline` treats `hostUndoKind` as a host skip and returns unknown without restoring SceneHistory — that is why spoken “undo” was a no-op. Both Talk and type-in go through `submitTranscript` (`runText`). `finishRecording` holds `busyRef` only during transcribe, then releases it before submit so the pipeline lock is not double-held.

Completing a deictic ask with empty `candidates` is App chrome: ClarifyPanel **Use selection** reapplies `originalTranscript` with the live board ids. The orchestrator does not consume a use-selection event.

## Approach C (locked): roles + typed tools + Command fast path

Rejected A (six vision agents with screenshots) and B (host regex “isStructural” plus one patch LLM). This slice is **C**: full role contracts (enhancer → judge → command **or** build/plan), a closed `applyEditPlan` tool set, Command JSON as the fast path for the nine layout ops, deterministic `verifyEdit` / `reviewPlan` (no vision verify), and whole-board generation still host WONTFIX. Judge overlay never defaults to `plan` on LLM failure. Host must not regex-route align/perfect.

## Snapshot is scene JSON clone + hash, not a camera image

A “screenshot” in this product is a structured board snapshot: clone the scene JSON, hash it (`sceneHash`), optionally show SVG to humans. Never send a camera image, PNG, or vision payload to the model. `projectForAgentSafe` is the LLM copy (pins and `ink.points` stripped). `getLiveHash()` / start `sceneHash` gate writes so a human draw during the run cancels apply.

## Plan is reviewed in code first; optional LLM review stays unwired

Judge may route `plan` for multi-step edits. The plan LLM returns `{goal, steps, expected?, say}` (`EditToolCall[]`, max 12), never coordinates. The host runs **`reviewPlan` in code** before any write: coordinate keys, length, beautify `freezePins: false`, strict unnamed `add_node`, and sidecar insert (`add_edge` A→B plus `insert_on_path` on that existing edge). Insert-on-path alone is allowed (the kernel splices). Tests must pass with no LLM review.

One replan (`TURN_CAPS.maxReplans === 1`) sends `rejectReasons` back into the next plan payload. A second reject fails closed (`wrote: false`, original SHA). Approved steps reuse the build `runToolLoop` (`applyEditPlan` + `verifyEdit` with `plan.expected`). Verify failures after an approved plan do not start another plan loop.

`deps.reviewLlm` is optional and runs only after a deterministic approve. Production App wires `runPlan` and **does not** wire `reviewLlm`, so a hung or biased reviewer cannot gate writes. HTTP 500 / missing keys / parse failure return `null` (unknown, no write). No infinite plan while-loop: the replan counter is the only retry.

## Build role emits tools; verify is deterministic (no vision)

Judge may route `build`. The build LLM returns `{calls, say}` (`EditToolCall[]`), never coordinates. The host applies those tools with `applyEditPlan` on the **pre-build** scene, then `verifyEdit` checks the result: `validateScene`, insert splice (no sidecar A→B), beautify freeze (ids + kinds + pins), no coordinate keys in tool args, optional `expected` graph predicates.

Verify is **not** an LLM and does not take a screenshot. Pins in the stored scene are kernel-owned, so the verifier skips `pin` / ink `points` when walking `after` and only fails `COORDINATE_LEAK` on agent-owned keys and tool args.

Rebuild cap is `TURN_CAPS.maxVerifyAttempts === 2` (each build counts as an LLM call). Failures (apply errors or verify `rebuild`) go back as `errors` in the next build payload. After two misses the host returns the original scene (`wrote: false`) so a bad build cannot dirty the file SHA. `ask` (deictic / strict) does not rebuild. HTTP 500 is not retried.

`PipelineDeps.build` / `verify` stay injectable so orchestrator tests can mock a failing verifier without calling OmniRoute. Production App wires `runBuild` + `verifyEdit`. Plan is a later role: `reviewPlan` is deterministic; optional LLM review is not wired in App.

## Pipeline roles are injectable; production enhancer/judge call OmniRoute

`runPipeline` takes `PipelineDeps` so tests mock enhance/judge/requestCommand/build/verify. Production App injects:

- enhance → `runEnhancer` (`requestChatRole` role enhancer + `parseEnhancer` + host `bindReferents`)
- judge → `runJudge` (`requestChatRole` role judge + `parseJudge` + structural overlay)
- requestCommand → `resolveCommand(..., requestIntent)` so a ready enhancer without `command` still hits OmniRoute
- build → `runBuild` (`requestChatRole` role build + `parseBuild`)
- plan → `runPlan` (`requestChatRole` role plan + `parsePlan`); review is `reviewPlan` in the orchestrator (not an App-wired LLM)
- verify → `verifyEdit` (scene predicates; injectable in tests)

If `enhance.command` is a valid Command (`confidence >= 0.45`, `op !== unknown`), the host overlays `route: "command"` and **does not** call `requestCommand` (simple path can finish in 1 call). The enhancer LLM may include that Command JSON for a filled layout op; the host does **not** regex align/perfect.

Hard LLM cap is `TURN_CAPS.maxLlmCallsComplex` (5). `maxLlmCallsSimple` (2) is the command-path budget when overlay skips judge/requestCommand. Hash gating uses `getLiveHash` / `liveHash` / `nowHash` against the start snapshot so a human draw during the run cancels the write.

Asks are a `PendingAsk` + `ClarifyPanel`, not toast-only. `applyTurn.ask` (deictic / color / split) synthesizes pending so the panel always opens. `sceneAfterPipeline(live, out)` is how App commits: only a `wrote` result replaces the live scene, so a hash-gate cancel cannot wipe a concurrent drag.

## Host bindReferents after the enhancer LLM

The enhancer emits English `targetQueries`, not coordinates. `bindReferents` is host-only: exact node/edge ids pass through; otherwise `resolveReferent`. Any ask/none becomes an enhancer `ask` (even if the LLM said ready). Judge overlay never defaults to `plan` on parse/HTTP failure — fallback is `command`. A valid Command on the intent still forces `command`. A single structural step (`hints.structural` without `multiStep`) may overlay `plan` → `build`.

## Per-role OmniRoute budgets

Client timeout and `max_tokens` live in `ROLE_BUDGETS` keyed by `ChatRole`. Fast Command stays **4s / 200**. Enhancer/judge/plan/review/build do not inherit that global cap. Turn caps (`TURN_CAPS`) bound the orchestrator: `maxVerifyAttempts` is 2 for the build rebuild loop; `maxLlmCallsComplex` (5) is the hard LLM cap.

## Agent-safe projection strips pins

The model snapshot is `projectForAgentSafe`: no `pin`, no `ink.points`. `view.rel` / `view.containsSpatial` are computed from the **stored** scene so spatial relations stay correct after pins are stripped. `projectForAgent` remains the UI ScenePreview copy (pins may remain). Snapshot is structured JSON, never an image.

## Typed edit tools over free JSON Patch

The agent write API is a closed set of `EditToolCall`s applied by `applyEditPlan`, not open RFC6902. Free patch can target `/selection`, splice with `-` (NaN), or replace whole `/nodes`. Typed tools cannot express `pin.x` / width / ink points; the kernel still owns geometry. Command JSON `{op, args}` remains the LLM output for the original nine ops — `desugarCommand` is the adapter so there is one write path. JSON Patch stays for existing tests and host-gated turns, with a denylist for host fields (`selection`, `lastDrawn`, `schema`, `view`) and whole-record replace.

## Product domain

Software / system architecture diagrams (system design, AI/ML pipelines, cloud infra). Not building floor plans.

## Whole-board generation is a host refuse, not a keyword op table

A paragraph like “build an AI RAG pipeline architecture with …” must not mint a graph. That is classified as a **host WONTFIX** (same family as undo), not an OmniRoute shortcut for `align`. Short commands such as “align left” still go to the LLM.

Double-click label editing is **human-owned**, like drag-to-pin. The agent still cannot write coordinates.

Chrome `pointerdown.detail` is not a reliable click-count (often 0), and capturing the pointer on the SVG steals events from a `foreignObject` input. Labels therefore open on box-up (auto-focus) and on native `dblclick`. Pointer capture is drag-only. A 4px move threshold keeps a rename click from writing `pin`.

## This slice: architecture board + agent path

Voice → Groq Whisper → `runPipeline` (enhancer → judge → Command JSON **or** build/plan `EditToolCall[]`) → `applyEditPlan` → `arch-scene/v1` kernel → SVG board.

The agent surgically edits one scene. The kernel owns pins, sizes, and routes. Humans draw and drag. There is still **no keyword table** for diagram ops. Undo is a **host** channel (snapshots + op journal), not an OmniRoute shortcut for align/perfect. Valid `enhance.command` may skip `requestCommand`; that is an LLM-emitted Command, not a host regex.

## Scene file is JSON, not a yaml dependency

The contract is YAML-shaped (`diagram.arch.yaml` in the locked plan). This repo persists **JSON** (`localStorage` key `ai-diagram-tool:scene`) so we do not add a yaml parser. Field names and enums match `arch-scene/v1`. JSON is allowed by the plan.

## No elkjs

`tidy-layout` uses a small layered rank layout in `src/scene/layout.ts` for **unpinned, unlocked** nodes. We do not serialize ELK dummy nodes. Human/locked pins stay put.

## Command JSON stays the LLM output

Existing OmniRoute tests require `{op, args, confidence, say}`. `desugarCommand` maps those ops onto `applyEditPlan` tools (`perfect` → convert-ink + beautify). Structural ops (`insert`, delete+retarget, merge) are kernel functions reachable on the live path via **build/plan tools**, not tests-only JSON Patch. The model must not emit coordinates. Fast Command payload is still `{ transcript, selectionCount, selection }` (no scene). Enhancer / plan / build send `projectForAgentSafe(scene)`.

## Beautify is not relayout and not AWS

Omitting freeze flags is valid: they are **implied**. Explicit `freezePins: false` (etc.) is invalid. Vague “nicer” / “clean this up” is beautify only. AWS icons require `palette: aws` + `restyle-icons`, and that pass still freezePins.

## Insert is a splice

“Add Redis in front of the DB” must not leave `api→db`. `insert { node, on: edgeId }` deletes the old edge and writes `A→node` and `node→B`. Kernel places the new pin between the endpoints.

## Questions and undo do not go through scene writes

Question-classified transcripts return the same scene object (SHA unchanged) and an answer string. Undo / put it back pops a host snapshot. “Undo last kafka bit” matches the op journal by label.

## Referents without vision

Unique `label`/`icon` (case-insensitive), else `selection` / `lastDrawn`, else `view.rel`. Two objects with the same name and a side-query that ties → ask. Color queries ask. No OCR.

## Stack: root Vite harness + Groq + OmniRoute

| Piece | Choice | Why |
|---|---|---|
| App | React + Vite at repo root | Harness + SVG board; no editor package |
| Scene | `src/scene/` TypeScript kernel | Closed schema; tests without a browser |
| Board | Custom SVG | Excalidraw JSON must not enter the model |
| STT | Groq `whisper-large-v3-turbo` | Hosted Whisper; filename must have an extension; `verbose_json` |
| Intent | OmniRoute on every command; model id from `.env` | No keyword/regex table; `"thinking": { "type": "disabled" }` |
| Keys | Settings / `localStorage` | Proxy must not read API keys from `process.env` |
| Tests | Vitest mocks + optional `npm run test:live` | Unit tests need no keys; live tests require keys and refuse 429 retries |

## What `frontend/`, `backend/`, `firebase/` are

They landed from `main` as a later canvas / Firebase hosting sketch (Google login, Firestore, FastAPI `/api/health`). They are **not** the current app. Do not run `cd frontend`. Do not reintroduce Web Speech or Excalidraw.

## What this slice will not do

No vision, OCR, color targeting, text-to-diagram from a paragraph or photo, duplicate board beside the original, protocol labels guessed onto arrows, split without named edges, Rumik/Ira talking companion, OpenCode CLI, env-key proxy, thinking-enabled LLM calls. English commands only.

## Tests

- `npm test`: mocks only; no Groq/OmniRoute network. Includes `tests/scene` contract tests.
- `npm run test:live`: requires `GROQ_API_KEY` (must start with `gsk_`), `OMNIROUTE_API_KEY`, and `OMNIROUTE_MODEL`. Optional `OMNIROUTE_URL` (default `http://localhost:20128`). Probe rate-limit endpoints first. At most one Whisper call and one chat completion. Do not retry 429. The app uses the same `OMNIROUTE_MODEL`; Settings has no model picker. The proxy must not read API keys from `process.env`.
