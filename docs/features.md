# Features

Voice-driven **architecture board**: speak or type a short command; Groq transcribes; OmniRoute DeepSeek always interprets the text (no keyword table). One scene file (`arch-scene/v1`) is the source of truth. The agent emits Command JSON or typed tools; `applyEditPlan` is the write API; the kernel compiles geometry. Humans draw, select, and drag on an SVG board. The model never invents coordinates.

STT/intent transport details: `docs/implementation-plan.md`. Scene contract: this file + `src/scene/`. Pipeline: `src/agent/`.

---

## 1. Product

Software-architecture diagrams (system design, AI/ML pipelines, cloud infra). Voice and type-in go through the model. The model never invents coordinates.

**Stack:** Vite React app at the repo root. SVG board. `arch-scene/v1` kernel. Same-origin proxies `/api/transcribe` (Groq Whisper) and `/api/intent` (OmniRoute OpenCode Go DeepSeek, per-role `requestChatRole`). Keys in Settings.

```
Human draw / drag ─┐
                   ├─► scene (JSON) ─► kernel (validate, passes, layout) ─► board
Agent path ────────┘
  enhancer → judge → Command JSON
                   or build/plan EditToolCall[]
                   → applyEditPlan → kernel
```

---

## 2. What this is not

| Class | Why we differ |
|---|---|
| Voice → whole diagram | One surgical edit on the implied selection, not a regenerated graph |
| Screenshot / dump-the-scene agents | Compact scene + `view`; never Excalidraw JSON or `ink.points` in the model |
| Keyword / regex command maps | The LLM interprets every phrase (undo is a host channel) |
| Always-on talking companion | Push-to-talk command, no TTS |
| Graphviz / C4-as-code | Drawing board first; the file is semantic, the kernel owns pixels |

---

## 3. Locked architecture

1. **One scene.** `schema: arch-scene/v1`. JSON on disk (`localStorage`). YAML-shaped field names.
2. **Agent never writes** `pin.x` / `pin.y`, `width`, `height`, `ink.points`, hex colors, or invented icon keys. It may **delete** a pin to unpin.
3. **Kernel / human own geometry.** Human drag writes `pin` only. Camera pan/zoom is not stored.
4. **No vision model.** No OCR, no color query (“the blue one”).
5. **No LLM inventing coordinates.** Speech → Groq → pipeline (`requestChatRole` roles) → Command JSON **or** `EditToolCall[]` → `applyEditPlan`. JSON Patch is **not** the LLM write API.
6. **No keyword parser** for diagram ops. Known phrases and paraphrases both hit DeepSeek. Host-only: undo / put it back / undo last hunk.
7. **Questions never write.** SPOF / explain / missing cache / 3-tier → answer channel, SHA unchanged.
8. **`beautify` is a frozen recipe:** freezeTopology + freezeSemantics + freezePins. Not AWS. Not type promotion. Not global relayout.
9. **`insert` splices** `A→B` into `A→node→B`. Sidecar that leaves `A→B` is a bug.
10. Type-in needs OmniRoute keys. Empty keys toast; they do not silently match regex.
11. English only.

---

## 4. This slice

### F1 — Board

Select, box, pen, connect. Click-drag boxes write `pin` and a `size` token; releasing a box opens the label field (double-click also edits). Pen writes `ink.points` (stored; stripped from the agent projection). Selection is real ids. Wheel zoom / space-drag pan are camera-only. Pointer capture is only for drags so the label input can receive clicks.

### F2 — Voice

Click-to-toggle Talk. Clip 300ms–15s. Groq `whisper-large-v3-turbo` via `POST /api/transcribe`. No Web Speech.

### F3 — Intent (pipeline)

Host skips (no enhance/judge/command): undo, questions, whole-board generation, color targeting, split without named edges, duplicate board.

Everything else is OmniRoute roles via the same `POST /api/intent`, thinking disabled (`requestChatRole`):

- **Fast Command payload** remains `{ transcript, selectionCount, selection }` (no scene).
- **Enhancer / plan / build payloads** include `projectForAgentSafe(scene)` (no pins, no `ink.points`, plus `view`).
- Valid `enhance.command` skips `requestCommand`. Host `bindReferents` runs after the enhancer LLM.
- Clarifying questions are a host channel (`ClarifyPanel`); SHA unchanged until a write.
- **Verify** is `verifyEdit` scene predicates + tool trace, **not** a vision model or screenshot.

### F4 — Ops (executed on the scene)

perfect, align, distribute, snap, bigger, smaller, equalize, connect, rotate → Command JSON fast path → `desugarCommand` → `applyEditPlan` → kernel constraints / passes.

Structural ops (`insert` on path, `merge`, `delete`+`retargetTo`, `tidy-layout`, `unoverlap`, `convert-ink` (same id), `restyle-icons` with `palette: aws` and freezePins, `annotate-path`) are reachable via **build/plan tools** on the live agent path, not tests-only. Geometry stays kernel-owned.

### F5 — Agent projection

`projectForAgent` is the UI ScenePreview copy: omits `ink.points`, adds read-only `view.rel` / `view.containsSpatial`; **pins may remain**. The stored file keeps points.

`projectForAgentSafe` is the LLM snapshot: **pins stripped**, no `ink.points`, plus `view` computed from the stored scene. Enhancer / plan / build payloads use this. Fast Command still sends no scene.

---

## 5. Phrases (English)

The model maps natural English onto the ops above. Examples:

| Operation | You can say |
|---|---|
| Perfect / beautify | “perfect this”, “clean this up”, “make this a rectangle” |
| Align | “align left”, “align these”, “center these horizontally” |
| Distribute | “distribute horizontally”, “space these evenly” |
| Snap | “snap to grid” |
| Resize | “make this bigger”, “smaller” |
| Equalize | “make these the same size”, “same width” |
| Connect | “connect these” |
| Rotate | “rotate”, “rotate 90” |
| Insert (splice) | “add Redis in front of the DB” → `insert_on_path` even with empty selection if the model names the DB |
| Questions | “what’s the SPOF?”, “are we missing a cache?” → no file write |
| Undo | “undo”, “put it back” (host snapshot); “undo last kafka bit” (host journal) |

Bare “align these” / “distribute” without an axis → the model should return `unknown` with a hint (not invent an axis). Vague prompts may **ask** (`ClarifyPanel`); SHA unchanged until a write.

Empty selection + “perfect this” → ask, no write.

“Add Redis in front of the DB” is an insert splice even with empty selection if the model names the DB. Sidecar `api→db` is a bug.

---

## 6. Out of this slice (WONTFIX v1 — say no, do not fake)

- Vision / color query / OCR
- Whole-board generation from a paragraph or photo
- Protocol hallucination on unlabeled arrows
- Duplicate diagram beside the original (one id namespace)
- Trust-boundary / “private stuff” without `exposure` already set
- Split without named edges
- Treating `beautify` as `perfect` only, or as “make it AWS”
- Web Speech, env-key proxy, OpenCode CLI, thinking-enabled LLM calls
- Keyword / regex intent shortcuts
- Non-English commands
- Excalidraw as the scene

---

## 7. Scene file (closed)

Readable ids `^[a-z][a-z0-9_]*$`. Agent mints ids only when **adding** a node.

Groups: `groups.vpc` *is* that group. Do not also have `nodes.vpc.kind: group`. Nest via `parent`.

Host injects `selection[]` and `lastDrawn`. Read-only `view` is prompt-only, never written back.

Referents: unique `label` / `icon` (case-insensitive), else selection / lastDrawn, else `view.rel`. Two Kafkas with a rel tie → ask.

---

## 8. Demo (this slice is done when)

1. Type `align left` with empty OmniRoute keys → toast asking for a key; no Command from regex.
2. Type `align left` with OmniRoute keys → DeepSeek Command JSON (enhancer `command` and/or command role), then the kernel aligns selected pins.
3. Talk with no Groq key → toast, no Groq request.
4. Draw a box, select it, say “perfect this” → `/api/intent` runs; board restyles in place.
5. “Add Redis in front of the DB” (build/plan `insert_on_path`) does not leave `api→db`.
6. “What’s the SPOF?” does not change the scene SHA.
7. OmniRoute down → unknown, no crash.
8. Empty OmniRoute key still toasts (enhancer refuse; no regex fallback).
9. Empty selection + deictic “this” / “these” / “perfect this” opens **ClarifyPanel**; no write.
10. Question turns leave the scene SHA unchanged.

---

## 9. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Domain | Software architecture diagrams |
| 3 | Command list | Keep the full list, including rotate and equalize |
| 10 | Language | English only |
| 11 | STT | Groq Whisper `whisper-large-v3-turbo` via `POST /api/transcribe` |
| 12 | Intent | OmniRoute OpenCode Go DeepSeek on **every** command; no keyword table |
| 13 | Coordinates | Never from the LLM; kernel/human own pins |
| 14 | Canvas | **This slice.** Custom SVG board + `arch-scene/v1`. Not Excalidraw |
| 15 | Keys | Settings only. No env-key fallback |
| 16 | Thinking | `{ "type": "disabled" }`. HTTP 400 → omit once |
| 17 | Default model | Flash. Settings select Pro |
| 18 | No Web Speech | Groq fail → toast |
| 19 | Talk | Click-to-toggle only. 300ms–15s |
| 20 | Scene for agents | Semantic YAML-shaped JSON; agent projection omits ink points |
| 21 | Beautify | Frozen recipe with implicit freezes |
| 22 | Insert | Splice on path, not a sidecar |
| 23 | Questions | SHA-stable answer channel |
| 24 | Typed tools | `applyEditPlan` is the write API; JSON Patch is not the LLM write API |
| 25 | Pipeline roles | enhancer → judge → command **or** build/plan; host `bindReferents` after enhancer |
| 26 | Verify without vision | `verifyEdit` scene predicates + tool trace; never a screenshot |
| 27 | Command JSON fast path | Valid `enhance.command` skips `requestCommand`; host must not regex align/perfect |
