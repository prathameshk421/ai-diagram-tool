# CHANGELOG

Newest first. **This file is for the agent.** Append an entry on every repo change.

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
