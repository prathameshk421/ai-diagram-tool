# Features

v1.1 **agent path** for a voice-driven architecture-diagram assistant: you speak or type a short command; Groq transcribes; a keyword parser (then OmniRoute DeepSeek on miss) emits a closed `Command` JSON. There is **no drawing surface in this slice**.

A later canvas will plug in as an **agent harness**: the same commands become tools against an agent-optimized scene model (not a raw editor dump). Geometry and board UX are specified then.

Implementation detail: `docs/implementation-plan.md`.

---

## 1. Product

Software-architecture diagrams (system design, AI/ML pipelines, cloud infra). Voice and type-in map to a tiny op set. The model never invents coordinates.

**Stack (this slice):** Vite React harness page. Same-origin proxies `/api/transcribe` (Groq Whisper) and `/api/intent` (OmniRoute OpenCode Go DeepSeek). Keys in Settings. Type-in works with empty keys. STT + LLM ship. No board.

---

## 2. What this is not

| Class | Why we differ |
|---|---|
| Voice → whole diagram | We emit one op on the implied selection, not a regenerated graph |
| Screenshot / dump-the-scene agents | Agents will get tools + a compact scene, not stroke JSON |
| Always-on talking companion | Push-to-talk command, no TTS |

---

## 3. Locked architecture

1. **Command JSON is the contract.** Later tools use the same ops/args.
2. **No vision model** this slice.
3. **No LLM inventing coordinates.** Speech → Groq → keywords → OmniRoute on unknown → `{op, args, confidence, say}`.
4. **No drawing surface this slice.** Canvas + tool harness come after.
5. **Type-in works without a mic or keys.** STT and LLM still ship.
6. **Keywords first.** Known phrases do not wait on DeepSeek.

---

## 4. This slice

### F1 — Harness UI

Talk toggle, type-in, Settings, selection-count stub, transcript, Command JSON preview.

### F2 — Voice

Click-to-toggle Talk. Clip 300ms–15s. Groq `whisper-large-v3-turbo` via `POST /api/transcribe`. No Web Speech.

### F3 — Intent

Keywords first. OmniRoute `opencode-go/deepseek-v4-flash` (Pro via Settings) via `POST /api/intent` with thinking disabled.

### F4 — Ops (names only; no execution)

perfect, align, distribute, snap, bigger, smaller, equalize, connect, rotate.

---

## 5. Phrases (English)

| Operation | You can say |
|---|---|
| Perfect | “perfect this”, “perfect this circle”, “clean this up”, “make this a rectangle” |
| Align | “align left”, “align these”, “center these horizontally” |
| Distribute | “distribute horizontally”, “space these evenly” |
| Snap | “snap to grid” |
| Resize | “make this bigger”, “smaller” |
| Equalize | “make these the same size”, “same width” |
| Connect | “connect these” |
| Rotate | “rotate”, “rotate 90” |

Bare “align these” / “distribute” without an axis → refuse with a hint, skip LLM.

---

## 6. Out of this slice

- Drawing surface, geometry, scene persist, undo on a board.
- Whole-diagram generation from a speech dump.
- Vision / pretty-up-this-sketch.
- Two-way TTS companion.
- OpenCode CLI / `opencode.json`.
- OmniRoute STT, Web Speech, env-key fallback, thinking-enabled LLM calls.
- Non-English commands.

---

## 7. Later: canvas + agent harness

When a canvas exists:

- Bind each `Command.op` as a tool (`align`, `perfect`, …) with the same args.
- Keep an agent-optimized scene (nodes, edges, constraints) rather than dumping editor internals into the model.
- Selection comes from that canvas; this slice’s `selectionCount` stub goes away.
- Geometry stays in code. The model still must not emit coordinates.

---

## 8. Demo (this slice is done when)

1. Type `align left` with empty keys → Command JSON `{op:"align", args:{edge:"left"}, …}`.
2. Type `asdfgh` → unknown toast.
3. Talk with no Groq key → toast, no Groq request.
4. With Groq, say “perfect this” → keywords, no OmniRoute.
5. With OmniRoute, a paraphrase keywords miss → Flash intent JSON.
6. OmniRoute down on a miss → unknown, no crash.

---

## 9. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Domain | Software architecture diagrams |
| 3 | Command list | Keep the full list, including rotate and equalize |
| 10 | Language | English only |
| 11 | STT | Groq Whisper `whisper-large-v3-turbo` via `POST /api/transcribe` |
| 12 | Intent | Keywords first; OmniRoute OpenCode Go DeepSeek on miss |
| 13 | Coordinates | Never from the LLM |
| 14 | Canvas | **Out of this slice.** Later custom board + agent tools |
| 15 | Keys | Settings only. No env-key fallback |
| 16 | Thinking | `{ "type": "disabled" }`. HTTP 400 → omit once |
| 17 | Default model | Flash. Settings select Pro |
| 18 | No Web Speech | Groq fail → toast |
| 19 | Talk | Click-to-toggle only. 300ms–15s |
| 20 | Scene for agents | Future agent-optimized graph, not a raw editor dump |
