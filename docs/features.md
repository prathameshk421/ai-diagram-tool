# Features

v1 for a **voice-driven diagramming assistant on Excalidraw**: you sketch a software architecture diagram, **select** the element(s), then say or click an operation. Only the selection changes. Geometry is math, not a vision model.

This file is the feature contract after the first review pass. Open items are called out at the bottom.

---

## 1. Product

A thin layer on the Excalidraw canvas. Sketch freely (including messy freehand). Click to select. Issue a short command — voice or a toolbar button — from a small fixed set. Undo is native Excalidraw history.

**Domain (locked):** architectural diagrams **for software people** — system design, AI/ML pipelines, cloud infra. Not buildings or floor plans.

**Stack (locked):** React web app. **Firebase** for production: Google login (Auth), saved diagrams (Firestore), Hosting. FastAPI stays as a small Python API for later helpers. The canvas still works without being signed in (scene in the browser until you save).

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
3. **No LLM inventing coordinates.** Keywords map speech → operation; code does the math.
4. **Embed Excalidraw’s React component.** Do not fork the editor.
5. **Voice is optional.** Every command has a button so the demo works without a mic.
6. **Always demoable.** Perfect-shape first, then voice, then (later) icons.

---

## 4. v1 features

### F1 — Excalidraw canvas

- Full editor: draw, select, pan, zoom, undo/redo, export.
- Chrome: toolbar, selection count, last command, voice status.
- Persist while drawing in the browser (localStorage or IndexedDB).
- **Signed-in save:** Cloud Firestore, scoped to the Google account. Debounced saves (not every stroke) so we stay inside the Spark free quota.

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

### F5 — Voice (v1)

- Push-to-talk (hold or toggle).
- Browser **Web Speech API** (Chrome). No Whisper server, no Rumik/Silk, no LLM.
- Show the transcript, map keywords to one operation.
- Unknown phrase → “Didn’t catch that” + examples.
- No mic → buttons still work.

### F6 — Buttons / type-in

Same ops as voice: Perfect, Align, Distribute, Snap, Bigger, Smaller, Connect, Rotate. Optional text field (`perfect`, `align left`).

### F7 — Safety

- Toast: what ran, or why it didn’t.
- Mutations go through Excalidraw undo.
- Never rewrite the rest of the diagram.

### F8 — Google login and production

- **Sign in with Google** via Firebase Auth.
- Unsigned users can still sketch locally.
- Production deploy: Firebase Hosting for the React app. Spark free tier is enough to test (Firestore 50k reads / 20k writes per day).
- Stay on Spark until traffic is real. Do not auto-save on every pointer move.

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
- Multiplayer / live cursors.
- Hosted STT/TTS (Whisper, Rumik, Deepgram).
- **Icon library** (explained below) and insert-symbol-by-voice.
- Non-English commands.

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

| v1 (locked) | Later (if we want Rumik-like) |
|---|---|
| You hold a button, say “align left”, canvas changes, tool stays quiet | Always listening; tool might say “aligned three boxes”; you can interrupt it |
| Web Speech in the browser | Hosted TTS (Silk) — extra API, not needed for Google login |

v1 stays command-style on purpose. Companion voice is a later product decision. Firebase is for **auth, save, and hosting**, not for the mic.

---

## 9. Demo (v1 is done when this works)

1. Draw a sloppy circle and two sloppy boxes.
2. Select the circle → **Perfect** or “perfect this” → clean ellipse; undo restores ink.
3. Select the two boxes → **Align left** / “align these left.”
4. Select both → **Connect** / “connect these.”
5. Nothing selected + “perfect this” → refused; the rest of the board does not move.

---

## 10. Decision log

| # | Topic | Decision |
|---|---|---|
| 1 | Domain | Software architecture diagrams |
| 2 | Stack | React + Firebase (Auth Google, Firestore, Hosting) + FastAPI for Python helpers; Web Speech in the browser |
| 3 | Command list | Keep the full list, including rotate and equalize |
| 4 | Perfect | Auto-detect the shape from the ink; if you name a type, that wins |
| 5 | No selection | Refuse. Guessing later. |
| 6 | Multi-select bigger/smaller | Each shape scales around **its own center** |
| 7 | Equalize | Match the **largest** selected shape |
| 8 | Icon library | Explained; stays out of v1 |
| 9 | Text-to-diagram | No |
| 10 | Language | English only |
| 11 | Auth / deploy | Google login; Firestore for saved scenes; Firebase Hosting for production |
| — | Rumik/Ira voice | Research only for v1; two-way TTS is separate from Firebase |

No remaining yes/no blockers for v1 implementation unless you want to change 6 or 7 after the examples above.
