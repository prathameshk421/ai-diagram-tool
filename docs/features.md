# Features

Proposed v1 for a **voice-driven AI diagramming assistant on Excalidraw**: you hand-draw a rough software/system diagram, **select** the element(s), then say (or click) an operation. The AI never guesses which shape you mean. Geometry is deterministic code, not a vision model.

This file is the feature contract. Items marked **Confirm** are proposed defaults from the original brief and later research — push back before we implement.

---

## 1. Product in one paragraph

A thin layer on top of the Excalidraw canvas. The user sketches freely (including messy freehand). They click/tap to select one or more elements. They issue a short command — voice or a toolbar button — from a **small fixed operation set**. The tool mutates **only the selection** (or inserts relative to it). Undo is native Excalidraw history.

**Domain (Confirm):** software / system architecture diagrams (system design, AI/ML pipelines, cloud infra) — not building/floor-plan architecture.

---

## 2. What this is not

These already exist; we are not competing with them as the core loop:

| Existing class | Examples | Why it is a different product |
|---|---|---|
| Voice → whole diagram | YapDraw, Drawmaid, VoiceBoard | Model regenerates or patches a **graph**, not the selected stroke |
| Text-to-diagram / MCP agents | Excalidraw MCP, next-ai-draw-io, Sketchi | Agent infers targets from a lossy scene summary |
| Auto ink-to-shape on pen-up | Excalidraw draw-to-shape, Desert-Ant `shapes` | Converts **as you draw**, not “perfect **this** selected thing” |
| Cloud vendor icon packs | Azure/GCP Excalidraw libs, Lobe brand logos | Product/service logos, not RAG-pipeline primitives |

The gap we are filling: **deictic targeting (selection) + lightweight intent + math**, because “change this particular thing” fails when the agent only has a screenshot or a node-label graph.

---

## 3. Locked architecture decisions

Do not reopen these unless we explicitly decide to:

1. **Target = current selection**, not on-canvas numbering. Numbering is a possible later hands-free fallback, not v1.
2. **No vision model for shape correction.** Selected freehand `points[]` come from Excalidraw JSON; fitting is least-squares / RDP-style geometry.
3. **LLM (if any) only maps utterance → operation.** It does not invent coordinates, radii, or layouts.
4. **Embed Excalidraw’s React component.** Do not fork the editor.
5. **Voice is optional.** Every voice command has a visible button / shortcut so the demo works without a mic.
6. **Always demoable.** Ship selection + perfect-shape before voice; ship voice before the icon library.

---

## 4. v1 features

Priority is the order we should be able to demo.

### F1 — Excalidraw canvas

- Full Excalidraw editor: draw, select, pan, zoom, undo/redo, export.
- App chrome around it: toolbar for our operations, selection count, last command, voice status.
- Persist scene in the browser (localStorage or IndexedDB) so a refresh does not wipe the demo.

**Confirm:** local-only for v1 (no accounts, no backend required).

### F2 — Selection is the only target

- Operations run on `selectedElementIds` from Excalidraw app state.
- If nothing is selected, the command is refused with a clear message (“Select a shape first”).
- Multi-select is first-class for group ops (align, distribute, connect, equalize size).
- We do **not** parse “the blue box on the left” or send the whole scene to a model to find the target.

**Confirm:** if the user speaks while drawing (no selection), we still refuse rather than guessing.

### F3 — Perfect shape (core wow)

On the **selected** freehand stroke(s):

| Detected intent | Replacement |
|---|---|
| Closed round stroke | Ellipse / circle (least-squares fit) |
| Closed boxy stroke | Rectangle (axis-aligned; optional slight rotation if clearly rotated) |
| Closed diamond-ish | Diamond |
| Open nearly-straight | Line |
| Ambiguous / scribble | Leave as-is and say we could not snap it |

Rules:

- Preserve stroke color, width, fill, roughness, opacity from the original.
- Replace the freedraw with a real Excalidraw element (not a smoothed polyline pretending to be a circle).
- Keep the new element selected; one undo step restores the ink.
- If the selection is already a rectangle/ellipse/etc., “perfect” tightens it (e.g. ellipse → circle by equalizing axes, rectangle → snapped 90°).

**Confirm:** auto-detect the primitive from the points. A spoken type (“perfect this **circle**”) overrides detection when present.

### F4 — Layout operations on the selection

All of these ignore unselected elements.

| Operation | 1 selected | 2+ selected |
|---|---|---|
| Align left / right / top / bottom / center H / center V | no-op + hint | align to selection bounds |
| Distribute H / V | no-op + hint | even spacing |
| Snap to grid | snap each | snap each |
| Make bigger / smaller | scale about center | scale each about own center (or group bbox — **Confirm**) |
| Equalize width / height | no-op | match to largest (or first selected — **Confirm**) |
| Connect | no-op | arrow from first to second (and chain if 3+) |
| Rotate 90° | rotate | rotate each |

Use Excalidraw’s existing align/distribute where we can; wrap them so voice/buttons call the same code path.

### F5 — Voice layer

- Push-to-talk (hold or toggle) using the **browser Web Speech API** (Chrome). No Whisper server in v1.
- Transcript shown in the chrome; then a **keyword / small rule classifier** maps it to one operation in §5.
- Unknown utterance → “Didn’t catch a command” + list of examples. Do not call a large LLM in v1.
- Mic denied / unsupported browser → voice disabled, buttons still work.

**Confirm:** Web Speech + rules for v1, not Whisper and not an LLM classifier.

### F6 — Non-voice controls

Same operations as voice, so the product is usable and demoable without a microphone:

- Toolbar buttons: Perfect, Align (menu), Distribute, Snap, Bigger, Smaller, Connect.
- Keyboard shortcuts where they do not collide with Excalidraw (document them).
- Optional text field: type `perfect` / `align left` and Enter.

### F7 — Feedback and safety

- Toast: what ran (“Perfected 1 stroke → ellipse”) or why it didn’t.
- All mutations go through Excalidraw history (`CaptureUpdateAction.IMMEDIATELY`) so Cmd/Ctrl+Z works.
- Never delete the rest of the diagram. Never relayout unselected nodes.

---

## 5. v1 command phrases

Classifier is English-only in v1. Matching is on the transcript after lowercase + filler-word strip (`um`, `please`, `this`, `these`).

| Operation | Example phrases |
|---|---|
| Perfect | “perfect this”, “perfect this circle”, “clean this up”, “make this a rectangle”, “snap to shape” |
| Align | “align left/right/top/bottom”, “align these”, “center these horizontally” |
| Distribute | “distribute horizontally”, “space these evenly” |
| Snap to grid | “snap to grid”, “snap these” |
| Resize | “make this bigger”, “smaller”, “scale up” |
| Equalize | “make these the same size”, “same width” |
| Connect | “connect these”, “draw an arrow between them” |
| Rotate | “rotate”, “rotate 90” |

**Confirm:** this set is enough for v1. Drop rotate/equalize if we want a tighter demo.

---

## 6. Explicitly out of v1

- Generating a whole architecture from a prompt or a long voice monologue (YapDraw-style).
- Vision / screenshot-to-diagram / “make this sketch pretty” via a multimodal model.
- Conversational agent that talks back, barge-in, or interviews you.
- Numbering shapes on the canvas for fully hands-free targeting.
- Collaborative multiplayer.
- Accounts, cloud sync, hosted STT (Whisper/Deepgram).
- Integrating Excalidraw’s official text-to-diagram AI as a second mode.
- Custom AI/ML icon library (see §8) — **does not block v1**.
- Insert-symbol-by-voice until the library exists.
- Non-English commands.

---

## 7. Later (not v1, keep on the radar)

- Hands-free fallback: overlay numbers on visible elements; “perfect number 3”.
- Whisper tiny/small if Web Speech quality is poor.
- Tiny LLM/classifier only if keyword matching is too brittle.
- Insert RAG/LLM symbols from a custom `.excalidrawlib`.
- Optional complementary “generate diagram from text” mode, kept strictly separate from selection-edit.
- Group-aware perfect (several scribbles → several shapes in one command) — v1 already allows multi-select if each item is its own freedraw.

---

## 8. Icon library (deferred, independently useful)

Research finding: no public Excalidraw pack whose vocabulary is **LLM block, vector DB, embedding, retriever, reranker, RAG pipeline, agent orchestrator**. Cloud packs are Azure/GCP/AWS service logos; Lobe/simple-icons are brand marks.

When we do this (after F1–F7):

- Hand-drawn Excalidraw aesthetic (not official SVG dumps).
- Ship as a `.excalidrawlib` that also works in vanilla excalidraw.com.
- Suggested v1 symbol list (Confirm count/style later): LLM, embedding model, vector DB, retriever, reranker, prompt cache, agent, tool/function, memory, RAG pipeline (composed), orchestrator, eval/guardrail.

---

## 9. Demo script (v1 done when this works)

1. Draw a sloppy circle and two sloppy boxes with the freedraw tool.
2. Select the circle → click **Perfect** (or say “perfect this circle”) → clean ellipse/circle, ink gone, undo restores ink.
3. Select the two boxes → **Align left** / “align these left”.
4. Select both boxes → **Connect** / “connect these”.
5. With no selection, say “perfect this” → refused, nothing else on the canvas moves.

---

## 10. Confirm with you

Please yes/no (or edit) these before implementation:

1. **Domain** is software/system architecture, not buildings.
2. **v1 stack:** Excalidraw React embed, local-only, Web Speech API, keyword intent, no backend.
3. **v1 ops:** perfect, align, distribute, snap-to-grid, bigger/smaller, equalize, connect, rotate. (Any to cut?)
4. **Perfect** auto-detects the primitive; spoken type overrides.
5. **No selection ⇒ refuse**, never guess.
6. **Multi-select scale** about each element’s center vs the group bounding box.
7. **Equalize** to the largest selected element vs the first selected.
8. **Icon library and insert-symbol** stay out of v1.
9. **No text-to-diagram mode** in v1 (even as a side panel).
10. **English-only** commands in v1.

Once these are locked, this file becomes the implementation checklist.
