# DECISIONS

**This file is for the agent.** Record why a stack, library, test, or design was chosen. Add a section whenever you decide something non-obvious.

## Pipeline roles are injectable; production enhancer/judge call OmniRoute

`runPipeline` takes `PipelineDeps` so tests mock enhance/judge/requestCommand/build. Production App injects:

- enhance → `runEnhancer` (`requestChatRole` role enhancer + `parseEnhancer` + host `bindReferents`)
- judge → `runJudge` (`requestChatRole` role judge + `parseJudge` + structural overlay)
- requestCommand → `resolveCommand(..., requestIntent)` so a ready enhancer without `command` still hits OmniRoute

If `enhance.command` is a valid Command (`confidence >= 0.45`, `op !== unknown`), the host overlays `route: "command"` and **does not** call `requestCommand` (simple path can finish in 1 call). The enhancer LLM may include that Command JSON for a filled layout op; the host does **not** regex align/perfect.

Hard LLM cap is `TURN_CAPS.maxLlmCallsComplex` (5). `maxLlmCallsSimple` (2) is the command-path budget when overlay skips judge/requestCommand. Hash gating uses `getLiveHash` / `liveHash` / `nowHash` against the start snapshot so a human draw during the run cancels the write.

Asks are a `PendingAsk` + `ClarifyPanel`, not toast-only. `applyTurn.ask` (deictic / color / split) synthesizes pending so the panel always opens. `sceneAfterPipeline(live, out)` is how App commits: only a `wrote` result replaces the live scene, so a hash-gate cancel cannot wipe a concurrent drag.

## Host bindReferents after the enhancer LLM

The enhancer emits English `targetQueries`, not coordinates. `bindReferents` is host-only: exact node/edge ids pass through; otherwise `resolveReferent`. Any ask/none becomes an enhancer `ask` (even if the LLM said ready). Judge overlay never defaults to `plan` on parse/HTTP failure — fallback is `command`. A valid Command on the intent still forces `command`. A single structural step (`hints.structural` without `multiStep`) may overlay `plan` → `build`.

## Per-role OmniRoute budgets

Client timeout and `max_tokens` live in `ROLE_BUDGETS` keyed by `ChatRole`. Fast Command stays **4s / 200**. Enhancer/judge/plan/review/build do not inherit that global cap. Turn caps (`TURN_CAPS`) are constants for a later orchestrator; this slice only ships the numbers.

## Agent-safe projection strips pins

The model snapshot is `projectForAgentSafe`: no `pin`, no `ink.points`. `view.rel` / `view.containsSpatial` are computed from the **stored** scene so spatial relations stay correct after pins are stripped. `projectForAgent` remains the UI ScenePreview copy (pins may remain). Snapshot is structured JSON, never an image.

## Typed edit tools over free JSON Patch

The agent write API is a closed set of `EditToolCall`s applied by `applyEditPlan`, not open RFC6902. Free patch can target `/selection`, splice with `-` (NaN), or replace whole `/nodes`. Typed tools cannot express `pin.x` / width / ink points; the kernel still owns geometry. Command JSON `{op, args}` remains the LLM output for the original nine ops — `desugarCommand` is the adapter so there is one write path. JSON Patch stays for existing tests and host-gated turns, with a denylist for host fields and whole-record replace.

## Product domain

Software / system architecture diagrams (system design, AI/ML pipelines, cloud infra). Not building floor plans.

## Whole-board generation is a host refuse, not a keyword op table

A paragraph like “build an AI RAG pipeline architecture with …” must not mint a graph. That is classified as a **host WONTFIX** (same family as undo), not an OmniRoute shortcut for `align`. Short commands such as “align left” still go to the LLM.

Double-click label editing is **human-owned**, like drag-to-pin. The agent still cannot write coordinates.

Chrome `pointerdown.detail` is not a reliable click-count (often 0), and capturing the pointer on the SVG steals events from a `foreignObject` input. Labels therefore open on box-up (auto-focus) and on native `dblclick`. Pointer capture is drag-only. A 4px move threshold keeps a rename click from writing `pin`.

## This slice: architecture board + agent path

Voice → Groq Whisper → OmniRoute OpenCode Go DeepSeek → Command JSON → `arch-scene/v1` kernel → SVG board.

The agent surgically edits one scene. The kernel owns pins, sizes, and routes. Humans draw and drag. There is still **no keyword table** for diagram ops. Undo is a **host** channel (snapshots + op journal), not an OmniRoute shortcut for align/perfect.

## Scene file is JSON, not a yaml dependency

The contract is YAML-shaped (`diagram.arch.yaml` in the locked plan). This repo persists **JSON** (`localStorage` key `ai-diagram-tool:scene`) so we do not add a yaml parser. Field names and enums match `arch-scene/v1`. JSON is allowed by the plan.

## No elkjs

`tidy-layout` uses a small layered rank layout in `src/scene/layout.ts` for **unpinned, unlocked** nodes. We do not serialize ELK dummy nodes. Human/locked pins stay put.

## Command JSON stays the LLM output

Existing OmniRoute tests require `{op, args, confidence, say}`. The kernel **maps** those ops onto passes/constraints (`perfect` → convert-ink + beautify). Structural ops (`insert`, delete+retarget, merge) are kernel functions + JSON Patch. The model must not emit coordinates. User payload is `{ transcript, selectionCount, selection }`.

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
| Intent | OmniRoute DeepSeek Flash (Pro via Settings) on every command | No keyword/regex table; `"thinking": { "type": "disabled" }` |
| Keys | Settings / `localStorage` | Proxy must not read `process.env` |
| Tests | Vitest mocks + optional `npm run test:live` | Unit tests need no keys; live tests require keys and refuse 429 retries |

## What `frontend/`, `backend/`, `firebase/` are

They landed from `main` as a later canvas / Firebase hosting sketch (Google login, Firestore, FastAPI `/api/health`). They are **not** the current app. Do not run `cd frontend`. Do not reintroduce Web Speech or Excalidraw.

## What this slice will not do

No vision, OCR, color targeting, text-to-diagram from a paragraph or photo, duplicate board beside the original, protocol labels guessed onto arrows, split without named edges, Rumik/Ira talking companion, OpenCode CLI, env-key proxy, thinking-enabled LLM calls. English commands only.

## Tests

- `npm test`: mocks only; no Groq/OmniRoute network. Includes `tests/scene` contract tests.
- `npm run test:live`: requires `GROQ_API_KEY` (must start with `gsk_`) and `OMNIROUTE_API_KEY`. Probe rate-limit endpoints first. At most one Whisper call and one chat completion. Do not retry 429.
