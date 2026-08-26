# Features

v1.1 for a **voice-driven diagramming assistant on Excalidraw**: you sketch a software architecture diagram, **select** the element(s), then say or click an operation. Only the selection changes. Geometry is math, not a vision model.

This file is the feature contract. Implementation detail lives in `docs/implementation-plan.md`. That plan wins where this file is stale.

---

## 1. Product

A thin layer on the Excalidraw canvas. Sketch freely (including messy freehand). Click to select. Issue a short command — voice or a toolbar button — from a small fixed set. Undo is native Excalidraw history.

**Domain (locked):** architectural diagrams **for software people** — system design, AI/ML pipelines, cloud infra. Not buildings or floor plans.

**Stack (locked):** Vite React Excalidraw page. No accounts. Same-origin proxies `/api/transcribe` (Groq Whisper) and `/api/intent` (OmniRoute OpenCode Go DeepSeek). Keys in Settings. Buttons work with empty keys. STT + LLM ship in v1.1.

---

## 2. What this is not

| Existing class | Examples | Different because |
|---|---|---|
| Voice → whole diagram | YapDraw, Drawmaid | Regenerates a graph; does not edit the selected stroke |
| Text-to-diagram agents | Excalidraw MCP, next-ai-draw-io | Agent guesses the target from a summary |
| Auto ink-to-shape on pen-up | Excalidraw draw-to-shape | Converts as you draw, not “perfect **this** selected thing” |
| Two-way talking companion | [Rumik](https://rumik.ai) / Ira | Always-on conversation; the product *talks back* (see § Voice research) |

The gap: **you point by selecting**, then a tiny intent layer runs **deterministic** geometry. “Change this particular thing” fails in agents that only see a screenshot or node labels.

---

## 3. Locked architecture

1. **Target = current selection.** No numbering in v1. No “the blue box on the left.”
2. **No vision model** for shape correction. Fit the selected freehand `points[]` from Excalidraw JSON.
3. **No LLM inventing coordinates.** Speech → Groq STT → keyword parser, then OmniRoute on unknown, maps to a command JSON `{op, args, confidence, say}`. Code does the math. The model never emits coordinates.
4. **Embed Excalidraw’s React component.** Do not fork the editor.
5. **Every command has a button** so the demo works without a mic or keys. STT and LLM are still in v1.1, not optional PRs.
6. **Always demoable.** Perfect-shape first, then voice. Scaffold + toolbar must demo with empty Settings.

---

## 4. v1 features

### F1 — Excalidraw canvas

- Full editor: draw, select, pan, zoom, undo/redo, export.
- Chrome: toolbar, selection count, last command, voice status.
- Persist locally (localStorage or IndexedDB).

### F2 — Selection is the only target

- Operations use whatever is selected right now.
- **Nothing selected → refuse** (“Select a shape first”). Do not guess. Hands-free targeting can come later.
- Multi-select is required for align / distribute / connect / equalize.

### F3 — Perfect shape (core wow)

Selected freehand stroke(s) become a real Excalidraw shape:

| The ink looks like | It becomes |
|---|---|
| Closed and round | Circle / ellipse |
| Closed and boxy | Rectangle |
| Closed and diamond-ish | Diamond |
| Open and almost straight | Line |
| Scribble | Unchanged + “couldn’t snap that” |

Preserve color, width, fill, roughness. One undo restores the ink.

**How “perfect” picks the shape (plain English):**  
You do not have to name the shape. We look at the points and guess.  
If you *do* name it — “perfect this **circle**” — we force a circle even if the ink was a bit oval. That is the override.

### F4 — Layout ops on the selection

Unselected elements never move.

| Operation | 1 selected | 2+ selected |
|---|---|---|
| Align left / right / top / bottom / centers | hint: need 2+ | align |
| Distribute H / V | hint: need 2+ | even gaps |
| Snap to grid | snap it | snap each |
| Bigger / smaller | grow/shrink in place | **each box grows around its own center** (see plain English below) |
| Equalize size | hint: need 2+ | **stretch to the largest** selected box |
| Connect | hint: need 2+ | arrow first → second (chain if 3+) |
| Rotate 90° | rotate | rotate each |

**v1 keeps this full list** (including rotate and equalize). We are not cutting them unless the demo feels crowded later.

**Bigger/smaller with several boxes (plain English):**  
Imagine three servers side by side. “Make bigger” should make **each** box larger where it already sits. They should not fly outward as one blob. (The other option — scale the whole cluster from the middle — we are **not** doing in v1.)

**Equalize (plain English):**  
You selected a big box and a small box. “Make these the same size” → the small one grows to match the **biggest** one. We do not use “whichever you clicked first,” because that is easy to get wrong.

### F5 — Voice (v1.1)

- Push-to-talk (hold or toggle).
- STT: Groq `whisper-large-v3-turbo` via `POST /api/transcribe`. **No Web Speech.**
- Intent: keywords first; OmniRoute OpenCode Go DeepSeek (`opencode-go/deepseek-v4-flash` default, Pro via Settings) via `POST /api/intent` with thinking disabled.
- Show the transcript, map to one operation.
- Unknown phrase → “Didn’t catch that” + examples.
- No mic / no keys → buttons still work. Groq fail → toast + toolbar, not browser speech.

### F6 — Buttons / type-in

Same ops as voice: Perfect, Align, Distribute, Snap, Bigger, Smaller, Connect, Rotate. Optional text field (`perfect`, `align left`).

### F7 — Safety

- Toast: what ran, or why it didn’t.
- Mutations go through Excalidraw undo.
- Never rewrite the rest of the diagram.

---

## 5. v1 phrases (English only)

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

---

## 6. Out of v1

- Whole-diagram generation from a speech dump (YapDraw).
- **No text-to-diagram** panel or mode.
- Vision / “pretty up this sketch” with a multimodal model.
- Two-way talking companion (Rumik/Ira style) — see below.
- Numbered shapes for fully hands-free targeting.
- Multiplayer, accounts, cloud sync.
- **No TTS.** No two-way companion. Hosted STT (Groq) and intent (OmniRoute) are in v1.1, keyed in Settings, proxied same-origin.
- **Icon library** (explained below) and insert-symbol-by-voice.
- Non-English commands.
- Web Speech, env-key fallback, thinking-enabled LLM calls.

---

## 7. Icon library — what that means

Not a settings “library.” It is a **sticker pack of architecture symbols** you drag onto the canvas (Excalidraw `.excalidrawlib` file).

The original idea: symbols software people actually need for AI/ML diagrams — LLM block, vector database, embedding, retriever, reranker, agent orchestrator — because public packs are mostly AWS/GCP/Azure logos.

**Locked: out of v1.** Perfect + voice first. The pack can be added later without changing the editor.

---

## 8. Voice research: rumik.ai (and roommate.ai)

**[rumik.ai](https://rumik.ai)** (likely what “remuk.ai” referred to) is a voice lab, not a diagram tool.

- **Silk** — text-to-speech: the *agent speaks* (expressive, Hinglish, ~150–300 ms, barge-in / interrupt).
- **Ira** — companion app: you talk, she talks back, remembers context, voice notes and calls. Always-on conversation, not “hold mic → one command.”
- Their SDK is built for **full-duplex voice agents** (listen while speaking, interrupt mid-sentence).

**roommate.ai** did not load (the site returned an error). There is no public diagram product at that URL. Rumik’s Ira is the “AI roommate / companion” in that family.

**What is actually new there:** two-way, interruptible, low-latency *talking*, not better speech-to-text for commands.

**What we do with that:**

| v1.1 (locked) | Later (if we want Rumik-like) |
|---|---|
| You hold a button, Groq transcribes, keywords map known phrases, OmniRoute DeepSeek maps the rest, canvas changes, tool stays quiet | Always listening; tool might say “aligned three boxes”; you can interrupt it |
| Groq Whisper + OmniRoute via same-origin proxy; keys in Settings | Hosted TTS (Silk) |

v1.1 stays command-style on purpose. Companion voice is a later product decision, not a v1.1 dependency.

---

## 9. Demo (v1.1 is done when this works)

**Empty keys (demo floor):**

1. Draw a sloppy circle and two sloppy boxes.
2. Select the circle → **Perfect** or type `perfect this` → clean ellipse; undo restores ink.
3. Select the two boxes → **Align left** / type `align these left.`
4. Select both → **Connect** / type `connect these.`
5. Nothing selected + Perfect → refused; the rest of the board does not move.

**With Groq + OmniRoute (required, not a bonus):**

6. Hold to talk → Groq transcript appears → known phrase runs via keywords without OmniRoute.
7. A paraphrase the parser misses runs via OmniRoute DeepSeek (thinking off) → canvas updates.
8. Groq or OmniRoute down → toast + toolbar/keywords still work. No Web Speech.

---

## 10. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Domain | Software architecture diagrams |
| 2 | Stack *(superseded)* | Was: local-only, Web Speech, keywords, no backend. **Superseded by 11–21.** |
| 3 | Command list | Keep the full list, including rotate and equalize |
| 4 | Perfect | Auto-detect the shape from the ink; if you name a type, that wins |
| 5 | No selection | Refuse. Guessing later. |
| 6 | Multi-select bigger/smaller | Each shape scales around **its own center** |
| 7 | Equalize | Match the **largest** selected shape |
| 8 | Icon library | Explained; stays out of v1.1 |
| 9 | Text-to-diagram | No |
| 10 | Language | English only |
| — | Rumik/Ira voice | Research only; two-way TTS needs a later product decision |
| 11 | STT | Groq Whisper `whisper-large-v3-turbo` via same-origin `POST /api/transcribe`. No Web Speech. |
| 12 | Intent LLM | OmniRoute OpenCode Go DeepSeek. Flash default, Pro via Settings. Same `/api/intent` path. User configures DeepSeek in the OmniRoute dashboard. |
| 13 | Keywords first | Parser always runs first. OmniRoute only on unknown when the key is set. |
| 14 | Command JSON | `{ op, args, confidence, say }`. Geometry only. LLM never emits coordinates. |
| 15 | Keys | Settings only. No env-key fallback. Buttons work with empty keys. STT + LLM still ship. |
| 16 | Thinking | Always `{ "type": "disabled" }`. Pro is GO because thinking is off. |
| 17 | Default model | `opencode-go/deepseek-v4-flash`. Override `opencode-go/deepseek-v4-pro`. |
| 18 | No Web Speech | Groq fail → toast + toolbar. |
| 19 | Proxy | Same-origin `/api/transcribe` and `/api/intent` only. |
| 20 | Upstream down | Runtime degrade to keywords/buttons. Not a scope cut. |
| 21 | SSRF | Local demo. Forward Settings URL. No allowlist delay. |

**Verdict:** FULL GO for v1.1 with the reliability locks above baked in. Nothing here is a delay.
