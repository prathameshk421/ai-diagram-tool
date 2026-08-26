# v1 implementation plan

Voice-driven Excalidraw architecture diagrammer. A junior engineer should be able to implement this file top-to-bottom without inventing product behavior.

**Locked (do not reopen):**
- Target = current selection only. Nothing selected → refuse. Do not guess.
- Geometry is TypeScript. The LLM never emits coordinates, element JSON, or scene patches.
- STT = Groq Whisper `whisper-large-v3-turbo` via same-origin `POST /api/transcribe`.
- Intent = OmniRoute `POST {base}/v1/chat/completions` model `opencode-go/deepseek-v4-pro` via same-origin `POST /api/intent`.
- We do **not** ship OpenCode. The user configures an OpenCode Go DeepSeek connection + OmniRoute API key in the OmniRoute dashboard.
- Buttons work with empty keys.
- Ops: perfect, align, distribute, snap, bigger, smaller, equalize, connect, rotate.
- English only. Undo = native Excalidraw history.

This plan **supersedes** `docs/features.md` where that file still says “local-only / Web Speech / no LLM / no backend.” Update the decision log in the same PR as the scaffold (section 8).

---

## 0. Assumptions (not in the draft — follow unless product overrides)

Mark these in code comments as `ASSUMPTION` so they are easy to change.

| ID | Assumption | Default |
|---|---|---|
| A1 | Groq API key lives in Settings next to OmniRoute (drawer is “for keys”). If Settings Groq key is empty, proxy may use env `GROQ_API_KEY`. | both |
| A2 | Default OmniRoute base URL | `http://localhost:20128` (OmniRoute’s documented default; no trailing slash) |
| A3 | Bigger/smaller scale | `1.25` / `0.8` around each element’s own center |
| A4 | Rotate | `+90°` clockwise (`angle += Math.PI/2`), each selected element around its own center |
| A5 | Equalize “largest” | largest **area** (`width * height`). `"same width"` → width only; `"same height"` → height only; `"same size"` → both |
| A6 | Align/distribute with no axis in the phrase | refuse with hint copy (do not default to left/horizontal) |
| A7 | Connect order | `Object.keys(appState.selectedElementIds)` (Excalidraw insertion/selection order). Arrow `first → second`; chain `1→2, 2→3, …` |
| A8 | Grid size for snap | `20` (Excalidraw default) |
| A9 | LLM confidence < `0.45`, invalid JSON, or HTTP failure | run keyword parser; if that also fails → unknown |
| A10 | Scene persist | `localStorage` key `ai-diagram-tool:scene`. Settings: `ai-diagram-tool:settings` |
| A11 | Type-in box | keyword parser first; LLM only if parser returns `unknown` **and** OmniRoute key is set |
| A12 | Perfect-shape numeric thresholds | section 1.4. Treat as tunables, not product forks |
| A13 | SSRF | `/api/intent` forwards to the URL from Settings. v1 is a local demo; do not add a URL allowlist unless asked |
| A14 | Test runner | Vitest. No Playwright in v1; browser flow is a manual checklist |

---

## 1. Proposed file tree

Create these paths. Do not add files outside this list in v1.

```
/workspace/
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  vitest.config.ts
  index.html
  .env.example
  README.md                          # fill in run + Settings + curl
  docs/features.md                   # section 8 edits only
  docs/implementation-plan.md        # this file
  src/
    main.tsx
    App.tsx
    styles.css
    vite-env.d.ts
    chrome/
      Toolbar.tsx
      StatusBar.tsx
      SettingsDrawer.tsx
      CommandInput.tsx
    voice/
      recorder.ts
      transcribeClient.ts
      webSpeech.ts
    intent/
      types.ts
      systemPrompt.ts
      omnirouteClient.ts
      keywordParser.ts
      resolveCommand.ts
    geometry/
      bounds.ts
      perfect.ts
      align.ts
      distribute.ts
      snap.ts
      resize.ts
      equalize.ts
      connect.ts
      rotate.ts
      applyOp.ts
    settings/
      store.ts
    persist/
      scene.ts
  server/
    proxy.ts                         # Vite middleware: /api/transcribe, /api/intent
  tests/
    intent/keywordParser.test.ts
    geometry/perfect.test.ts
    geometry/align.test.ts
    geometry/distribute.test.ts
    geometry/snap.test.ts
    geometry/resize.test.ts
    geometry/equalize.test.ts
    geometry/connect.test.ts
    geometry/rotate.test.ts
    geometry/applyOp.test.ts
```

**Do not create:** a Python backend, Docker, auth, a second canvas, icon libraries, TTS.

### 1.1 Scaffold commands (run in `/workspace`)

```bash
npm create vite@latest . -- --template react-ts
# If the directory is not empty, create in /tmp/vite-app and copy
# package.json, index.html, tsconfig*.json, vite.config.ts, src/main.tsx, src/vite-env.d.ts
# over, keeping README.md, docs/, .gitignore.

npm install
npm install @excalidraw/excalidraw
npm install -D vitest
```

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`index.html`: root `<div id="root"></div>`. Title: `AI Diagram Tool`.

`src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles.css` (required — Excalidraw dies without a definite height):

```css
html, body, #root { height: 100%; margin: 0; }
.app { display: flex; flex-direction: column; height: 100%; }
.chrome { flex: 0 0 auto; }
.canvas { flex: 1; min-height: 0; }
```

`.env.example` (never commit real keys):

```
GROQ_API_KEY=
```

---

## 2. Data flow (mic → Groq → OmniRoute → geometry → canvas)

Buttons skip steps 1–6. Type-in skips 1–3 (and 4–6 if the keyword parser hits).

```
1. Pointer down on "Hold to talk"
      src/voice/recorder.ts  MediaRecorder  mimeType audio/webm;codecs=opus
2. Pointer up
      stop recorder → Blob
3. POST /api/transcribe          server/proxy.ts
      FormData (section 4) → https://api.groq.com/openai/v1/audio/transcriptions
4. Groq JSON { text }
      show transcript in StatusBar
5. resolveCommand(text, selectionCount)     src/intent/resolveCommand.ts
      a. if OmniRoute URL + key set:
           POST /api/intent (section 5)
           parse choices[0].message.content → Command
           if invalid JSON or confidence < 0.45 (A9) → (b)
      b. keywordParser(text)                src/intent/keywordParser.ts
      c. if still unknown → toast "Didn't catch that"
6. If Groq HTTP error / network fail
      if Web Speech available and Settings.webSpeechFallback === true:
           re-prompt via Web Speech (one-shot) then jump to 5
      else toast Groq error copy (section 7)
7. applyOp(command, api)                    src/geometry/applyOp.ts
      read api.getAppState().selectedElementIds
      if empty → refuse, no scene write
      run the named geometry module
      api.updateScene({ elements, appState, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
8. StatusBar last command = command.say
   api.setToast({ message: command.say, duration: 2500 })
```

**Invariant:** `applyOp` is the only writer. LLM output is a `Command`. If `op === "unknown"`, do not call `updateScene`.

---

## 3. Settings fields and defaults

File: `src/settings/store.ts`. Persist JSON in `localStorage["ai-diagram-tool:settings"]`.

| Field | Type | Default | UI label | Placeholder |
|---|---|---|---|---|
| `omnirouteUrl` | string | `http://localhost:20128` | OmniRoute URL | `http://localhost:20128` |
| `omnirouteApiKey` | string | `""` | OmniRoute API key | `sk-…` |
| `groqApiKey` | string | `""` | Groq API key | `gsk_…` |
| `webSpeechFallback` | boolean | `true` | Fall back to Web Speech if Groq fails | — |

**Not in Settings (locked in code):**
- Groq model `whisper-large-v3-turbo`
- OmniRoute model `opencode-go/deepseek-v4-pro`
- STT `language=en`, `temperature=0`

**Save behavior:** button **Save** writes localStorage and closes the drawer. **Close** discards unsaved edits.

**Help text under the fields (exact copy):**

> Keys stay in this browser. They are never sent except to Groq (speech) and your OmniRoute URL (commands). Configure an OpenCode Go DeepSeek connection and an OmniRoute API key in the OmniRoute dashboard. This app does not install OpenCode.

---

## 4. Exact Groq FormData fields

Client: `src/voice/transcribeClient.ts`  
Proxy: `server/proxy.ts` → `POST https://api.groq.com/openai/v1/audio/transcriptions`

**Critical:** Groq rejects files whose filename has no extension. `FormData.append("file", blob)` is wrong. Always pass a filename.

```ts
const file = new File([blob], "utterance.webm", { type: blob.type || "audio/webm" });
const body = new FormData();
body.append("file", file, "utterance.webm");
body.append("model", "whisper-large-v3-turbo");
body.append("language", "en");
body.append("temperature", "0");
body.append("response_format", "json");
body.append(
  "prompt",
  "perfect this, perfect this circle, clean this up, make this a rectangle, align left, align these, center these horizontally, distribute horizontally, space these evenly, snap to grid, make this bigger, smaller, make these the same size, same width, connect these, rotate, rotate 90",
);
```

Browser → proxy:

```
POST /api/transcribe
Authorization: Bearer <settings.groqApiKey or empty>
Content-Type: multipart/form-data (browser-set boundary)
```

Proxy: clone the multipart body to Groq. Set `Authorization: Bearer ${clientHeader || process.env.GROQ_API_KEY}`. Do not rewrite the filename.

If both client key and env are empty → `401` JSON `{ "error": "missing_groq_key" }`.

Success pass-through:

```json
{ "text": "align these left" }
```

Recorder (`src/voice/recorder.ts`):
1. `navigator.mediaDevices.getUserMedia({ audio: true })`
2. `new MediaRecorder(stream, { mimeType: pickMime() })`
3. `pickMime()`: first of `audio/webm;codecs=opus`, `audio/webm`, `audio/ogg` that `MediaRecorder.isTypeSupported`
4. Filename must match: webm → `utterance.webm`, ogg → `utterance.ogg`. Never `blob` or `audio`.

---

## 5. Exact OmniRoute chat body

Client: `src/intent/omnirouteClient.ts`  
Proxy: `server/proxy.ts` → `POST {X-OmniRoute-Base}/v1/chat/completions`

Browser → proxy:

```
POST /api/intent
Authorization: Bearer <settings.omnirouteApiKey>
X-OmniRoute-Base: http://localhost:20128
Content-Type: application/json
```

If `omnirouteUrl` or `omnirouteApiKey` is empty, **do not call** `/api/intent`; use the keyword parser.

Request body (exact):

```json
{
  "model": "opencode-go/deepseek-v4-pro",
  "temperature": 0,
  "stream": false,
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "<SYSTEM_PROMPT from src/intent/systemPrompt.ts>"
    },
    {
      "role": "user",
      "content": "{\"transcript\":\"align these left\",\"selectionCount\":2}"
    }
  ]
}
```

User `content` is a JSON string with only:

```ts
{ transcript: string; selectionCount: number }
```

`selectionCount` is for the model’s `confidence` / `say` only. Geometry still enforces selection rules.

Proxy: `fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { Authorization, "Content-Type": "application/json" }, body })` where `base = req.header("X-OmniRoute-Base")` with trailing slash stripped. Return upstream status + JSON.

Parse on the client:

```ts
const raw = json.choices[0].message.content; // string
const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
const command = JSON.parse(stripped);
```

Validate with `isCommand()` in `src/intent/types.ts`. Invalid → keyword parser.

### 5.1 Command JSON schema (locked shape)

```ts
// src/intent/types.ts
export type Op =
  | "perfect" | "align" | "distribute" | "snap"
  | "bigger" | "smaller" | "equalize" | "connect"
  | "rotate" | "unknown";

export type Command = {
  op: Op;
  args: Record<string, unknown>;
  confidence: number; // 0..1
  say: string;        // toast / last-command text
};
```

**`args` per `op`:**

| op | args | Example |
|---|---|---|
| `perfect` | `{ shape?: "auto" \| "ellipse" \| "rectangle" \| "diamond" \| "line" }` | `{ "shape": "ellipse" }` |
| `align` | `{ edge: "left" \| "right" \| "top" \| "bottom" \| "centerH" \| "centerV" }` | `{ "edge": "left" }` |
| `distribute` | `{ axis: "h" \| "v" }` | `{ "axis": "h" }` |
| `snap` | `{}` | `{}` |
| `bigger` | `{}` | `{}` |
| `smaller` | `{}` | `{}` |
| `equalize` | `{ dim?: "both" \| "width" \| "height" }` | `{ "dim": "both" }` |
| `connect` | `{}` | `{}` |
| `rotate` | `{ degrees?: 90 }` | `{ "degrees": 90 }` |
| `unknown` | `{}` | `{}` |

Missing optional fields: `perfect.shape = "auto"`, `equalize.dim = "both"`, `rotate.degrees = 90`.

Toolbar buttons build the same `Command` with `confidence: 1` and the `say` strings in section 7. They never call Groq or OmniRoute.

---

## 6. System prompt outline (`src/intent/systemPrompt.ts`)

Export `SYSTEM_PROMPT` as one template string. Do not write a long essay. Include these blocks in this order:

1. **Role (2 sentences).** You convert one English diagram command into JSON. You never invent coordinates, element ids, or canvas JSON.
2. **Output.** Return only a JSON object `{ "op", "args", "confidence", "say" }`. No markdown.
3. **Allowed `op` values.** The enum in section 5.1. Anything else → `"unknown"`.
4. **`args` table.** Paste the table in section 5.1.
5. **Selection.** `selectionCount` is a hint. If the user asks align/distribute/equalize/connect and count < 2, still emit that op with `confidence` ≤ 0.5; geometry will refuse. Do not pick a different op.
6. **Named perfect.** “circle” / “ellipse” → `perfect` + `shape: "ellipse"`. “rectangle” / “box” → `"rectangle"`. “diamond” → `"diamond"`. “line” → `"line"`. Unnamed “perfect this” / “clean this up” → `shape: "auto"`.
7. **Align / distribute.** Require an `edge` / `axis`. “align these” with no side → `unknown` with say suggesting left/right/top/bottom/centers. “center these horizontally” → `align` + `centerH`. “center these vertically” → `centerV`.
8. **Phrases.** Map the table in `docs/features.md` §5.
9. **`say`.** Short past tense, e.g. `Aligned left.` / `Couldn’t understand that.`
10. **`confidence`.** Exact phrase 0.9–1.0; paraphrase 0.6–0.85; guess < 0.45.
11. **Out of scope.** Whole-diagram generation, “draw a VPC”, non-English, targeting by color/position → `unknown`.

No few-shot novel. At most **four** compact examples in the prompt:

```
"perfect this" → {"op":"perfect","args":{"shape":"auto"},"confidence":0.95,"say":"Perfected the selection."}
"perfect this circle" → {"op":"perfect","args":{"shape":"ellipse"},"confidence":0.95,"say":"Made this a circle."}
"align left" → {"op":"align","args":{"edge":"left"},"confidence":0.95,"say":"Aligned left."}
"draw a kubernetes cluster" → {"op":"unknown","args":{},"confidence":0.1,"say":"Didn’t catch that. Try: perfect this, align left, snap to grid."}
```

---

## 7. UI states and copy

Chrome is a bar **above** the canvas, not inside Excalidraw. `App.tsx` layout:

```
.app
  .chrome
    Toolbar
    CommandInput
    Hold-to-talk + Toggle
    Settings button
    StatusBar
  SettingsDrawer (overlay, closed by default)
  .canvas  → <Excalidraw />
```

### 7.1 Toolbar buttons (always enabled)

| Button label | Menu (if any) | Command |
|---|---|---|
| Perfect | — | `{ op:"perfect", args:{shape:"auto"}, confidence:1, say:"Perfected the selection." }` |
| Align ▾ | Left, Right, Top, Bottom, Center H, Center V | `edge` accordingly; say `Aligned left.` etc. |
| Distribute ▾ | Horizontal, Vertical | `axis:"h"` / `"v"`; say `Distributed horizontally.` |
| Snap | — | `{ op:"snap", args:{}, … say:"Snapped to grid." }` |
| Bigger | — | `say:"Made bigger."` |
| Smaller | — | `say:"Made smaller."` |
| Equalize | — | `{ dim:"both", say:"Equalized size." }` |
| Connect | — | `say:"Connected selection."` |
| Rotate | — | `say:"Rotated 90°."` |
| Settings | — | opens drawer; not an op |

**Assumption (UI encoding, not a new op):** Align and Distribute are split-button dropdowns so the bar stays one row.

### 7.2 StatusBar

| Slot | Empty / idle copy |
|---|---|
| Selection | `Selected: 0` (update live from `appState.selectedElementIds`) |
| Last command | `Last command: —` |
| Voice | `Voice: idle` |
| Transcript | hide the row when empty |

After a successful op: `Last command: Aligned left.` (use `command.say` without forcing a prefix if `say` is already a sentence).

### 7.3 Voice status values (exact strings)

| State | Status text | When |
|---|---|---|
| idle | `Voice: idle` | default |
| holding | `Voice: listening…` | MediaRecorder running |
| transcribing | `Voice: transcribing…` | waiting on Groq |
| thinking | `Voice: understanding…` | waiting on OmniRoute |
| applying | `Voice: applying…` | `applyOp` running (keep short) |
| web-speech | `Voice: browser speech…` | Web Speech fallback |
| no-mic | `Voice: no microphone` | getUserMedia rejected |
| error | `Voice: error` | see toasts |

**Hold to talk** button label: `Hold to talk`. While holding: `Listening…`.  
**Toggle** checkbox label: `Toggle talk`. When toggle-on: button label becomes `Stop talking`.

### 7.4 Command input

Placeholder: `Type a command (e.g. align left)`  
Submit: Enter. No extra button required. Empty submit → no-op.

### 7.5 Settings drawer

Title: `Settings`  
Fields: section 3.  
Buttons: `Save` · `Close`  
If Groq key empty and env also empty, still allow Save (buttons must work). Show warning (not a blocking modal):

`Voice needs a Groq key. Toolbar buttons still work.`

If OmniRoute key empty:

`Commands will use the keyword parser until an OmniRoute key is saved.`

### 7.6 Toasts (via `excalidrawAPI.setToast`)

**Success:** `command.say`

**Refuse — nothing selected (all ops):**

`Select a shape first.`

**Refuse — need 2+ (align, distribute, equalize, connect):**

| op | copy |
|---|---|
| align | `Select at least 2 shapes to align.` |
| distribute | `Select at least 2 shapes to distribute.` |
| equalize | `Select at least 2 shapes to equalize.` |
| connect | `Select at least 2 shapes to connect.` |

**Perfect could not classify:**

`Couldn’t snap that.`

**Unknown phrase (keyword + LLM):**

`Didn’t catch that. Try: perfect this, align left, snap to grid.`

**Groq failed, Web Speech off or unsupported:**

`Couldn’t transcribe. Check the Groq key in Settings, or use the toolbar.`

**Groq failed, Web Speech starting:**

`Groq failed. Try speaking again (browser speech).`

**OmniRoute failed (parser will still run; only toast if parser also unknown):** use the unknown phrase toast. Do not toast a raw stack trace.

**Mic permission denied:**

`Microphone blocked. Allow mic access, or use the toolbar.`

**Missing Groq key on voice press:**

`Add a Groq API key in Settings, or use the toolbar.`

### 7.7 Keyword parser (`src/intent/keywordParser.ts`)

Normalize: `trim`, lowercase, collapse whitespace, strip punctuation except spaces.

Match **first hit** in this order (more specific first):

| Test (includes / regex) | Command |
|---|---|
| `/perfect.*circle\|make (this \|it )?(a )?circle\|ellipse/` | perfect ellipse |
| `/make (this \|it )?(a )?rectangle\|make (this \|it )?(a )?box/` | perfect rectangle |
| `/diamond/` + perfect/make | perfect diamond |
| `/make (this \|it )?(a )?line/` | perfect line |
| `/perfect\|clean (this )?up/` | perfect auto |
| `/align left\|left align/` | align left |
| `/align right/` | align right |
| `/align top/` | align top |
| `/align bottom/` | align bottom |
| `/center( these)? horizontally\|align (horizontal )?cent/` | align centerH |
| `/center( these)? vertically\|align (vertical )?cent/` | align centerV |
| `/align/` | **unknown** with say `Didn’t catch that. Try: align left, right, top, bottom, or centers.` |
| `/distribut.*vert\|space .*vert/` | distribute v |
| `/distribut\|space .*even/` | distribute h |
| `/snap/` | snap |
| `/same width/` | equalize width |
| `/same height/` | equalize height |
| `/same size\|equalize/` | equalize both |
| `/bigger\|enlarge\|grow/` | bigger |
| `/smaller\|shrink/` | smaller |
| `/connect/` | connect |
| `/rotate/` | rotate 90 |
| else | unknown |

Parser `confidence`: `0.8` on hit, `0` on unknown.

---

## 8. What to update in `docs/features.md`

Do this in the **same PR as the Vite scaffold**, before writing voice code, so nobody implements the old Web-Speech-only contract.

### 8.1 Replace §3 item 3

From: “Keywords map speech → operation; code does the math.”  
To: “Speech → Groq STT → OmniRoute (or keyword fallback) maps to a command JSON `{op, args, confidence, say}`. Code does the math. The model never emits coordinates.”

### 8.2 Replace §3 item 5–6 (voice optional / always demoable)

Keep “every command has a button” and “Perfect-shape first, then voice.” Add: “Scaffold + toolbar must demo with empty Settings.”

### 8.3 Rewrite §1 stack sentence

From: “local-only Excalidraw page. No accounts, no backend, no hosted APIs in v1.”  
To: “Vite React Excalidraw page. No accounts. Same-origin proxies `/api/transcribe` (Groq Whisper) and `/api/intent` (OmniRoute). Keys in Settings. Buttons work offline.”

### 8.4 Rewrite F5 — Voice

Replace “Browser Web Speech API (Chrome). No Whisper server, no Rumik/Silk, no LLM.” with:

- Push-to-talk (hold or toggle).
- Primary STT: Groq `whisper-large-v3-turbo` via `POST /api/transcribe`.
- Primary intent: OmniRoute `opencode-go/deepseek-v4-pro` via `POST /api/intent`.
- Fallback: keyword parser if LLM fails; optional Web Speech if Groq fails.
- Show transcript. Unknown → “Didn’t catch that” + examples.
- No mic / no keys → buttons still work.

### 8.5 Rewrite §6 “hosted STT/TTS” bullet

Change to: “No TTS. No two-way companion. Hosted STT (Groq) and intent (OmniRoute) are in v1, keyed in Settings, proxied same-origin.”

### 8.6 Rewrite §8 table (Rumik)

v1 column: “Hold a button, Groq transcribes, OmniRoute (or keywords) maps to one op, canvas changes, tool stays quiet.”  
Do not claim Web Speech is the primary path.

### 8.7 Decision log — add rows (do not silently rewrite #2; strike it)

| # | Topic | Decision |
|---|---|---|
| 2 | Stack *(superseded)* | Was: local-only, Web Speech, keywords, no backend. **Superseded by 11–14.** |
| 11 | STT | Groq Whisper `whisper-large-v3-turbo`, `POST https://api.groq.com/openai/v1/audio/transcriptions`, proxied at `/api/transcribe`. `language=en`, `temperature=0`, vocab prompt. Filename must be `.webm`/`.wav`/`.ogg`. |
| 12 | Intent LLM | OmniRoute `POST {base}/v1/chat/completions`, model `opencode-go/deepseek-v4-pro`. User configures OpenCode Go DeepSeek + OmniRoute key in OmniRoute dashboard. App Settings stores OmniRoute URL + key. We do not ship OpenCode. |
| 13 | Fallbacks | Keyword parser if LLM fails. Optional Web Speech if Groq fails. |
| 14 | Command JSON | `{ op, args, confidence, say }`. Geometry consumes this only. |
| 15 | Keys | Settings drawer. Toolbar ops must work with empty keys. |

Keep rows 1, 3–10 as written.

---

## 9. Implementation order

Demoable after step 3. Do not start Groq/OmniRoute before the canvas ops work.

### Step 1 — Repo + types (no UI)

1. Scaffold Vite React TS (section 1.1).
2. Add `src/intent/types.ts` and `src/intent/systemPrompt.ts`.
3. Apply section 8 edits to `docs/features.md`.
4. Fill `README.md` with: `npm install && npm run dev`, open `http://localhost:5173`, Settings fields, curl examples from section 10.

### Step 2 — Geometry, fully unit-tested

Write functions that take plain element-like objects `{ id, type, x, y, width, height, angle, points? }` and return a next elements array. **No React, no API keys.**

Then write the tests in `tests/geometry/` (section 10.1) **in the same step** — do not defer tests until after UI.

| File | Export | Behavior |
|---|---|---|
| `bounds.ts` | `bbox(el)`, `center(el)` | axis-aligned box; center = `x+width/2, y+height/2` |
| `perfect.ts` | `perfectElements(els, ids, shape)` | section 9.1 |
| `align.ts` | `alignElements(els, ids, edge)` | 1 id → `{ ok:false, reason:"need_multi" }`; else move to shared edge; never change unselected |
| `distribute.ts` | `distributeElements(els, ids, axis)` | even **gaps** between boxes (not even centers). Sort by x or y. Need ≥3 to change anything; 2 → no-op success with say still “Distributed…” **Assumption A-extra:** 2 selected distribute is a no-op (nothing to even). Still `ok:true`. |
| `snap.ts` | `snapElements(els, ids, grid=20)` | `x,y,width,height` → `Math.round(v/grid)*grid` |
| `resize.ts` | `resizeElements(els, ids, factor)` | each scale about own center: `cx,cy` then `width*=f; height*=f; x=cx-width/2; y=cy-height/2` |
| `equalize.ts` | `equalizeElements(els, ids, dim)` | find max area among selected; apply width and/or height of that element; keep each center |
| `connect.ts` | `connectElements(els, ids)` | insert new `arrow` elements; do not move nodes |
| `rotate.ts` | `rotateElements(els, ids, degrees=90)` | `angle += degrees * π/180` |
| `applyOp.ts` | `applyOp(op, args, els, selectedIds)` | switch + map reasons to copy in section 7.6 |

Return type for all of these:

```ts
type GeomResult =
  | { ok: true; elements: T[]; say?: string }
  | { ok: false; reason: "no_selection" | "need_multi" | "couldnt_snap" };
```

Unselected elements must be referentially the same objects (same array slots / same ids, unchanged fields) so tests can `expect(unselected).toBe(original)`.

### Step 3 — Canvas chrome (demo without keys)

`src/App.tsx`:

1. `useState` for `ExcalidrawImperativeAPI`.
2. `<div className="canvas"><Excalidraw excalidrawAPI={setApi} onChange={persistScene} initialData={loadScene()} /></div>`
3. Toolbar clicks: `const appState = api.getAppState(); const ids = Object.keys(appState.selectedElementIds); const els = api.getSceneElements(); const result = applyOp(...); if (!result.ok) api.setToast({ message: REFUSE_COPY[result.reason] }); else api.updateScene({ elements: result.elements, appState: { selectedElementIds: /* keep / retarget */ }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });`
4. Import `CaptureUpdateAction` from `@excalidraw/excalidraw`. **Always `IMMEDIATELY`** so Ctrl/Cmd+Z restores ink (perfect) or previous layout.
5. StatusBar selection count from `onChange`.
6. Settings drawer wired to `settings/store.ts` (can be empty keys).
7. Command input → `keywordParser` → `applyOp`.
8. Persist: `src/persist/scene.ts` `JSON.stringify({ elements, appState })` into `localStorage`. Debounce 300ms. Do not persist collaborators.

**Perfect replacement rule:** set the old freedraw `isDeleted: true`; append the new shape with a **new id**; put the new id into `selectedElementIds`. One undo must restore the ink (Excalidraw history handles deleted+added as one `IMMEDIATELY` capture).

**Style copy for perfect:** copy `strokeColor`, `backgroundColor`, `strokeWidth`, `fillStyle`, `roughness`, `opacity`, `strokeStyle` from the ink onto the new shape.

Stop here and run the §9 demo in `docs/features.md` **with empty Settings**. If that demo fails, do not start Step 4.

### Step 4 — STT proxy + recorder

1. `server/proxy.ts` + mount in `vite.config.ts` `configureServer` / `configurePreviewServer`.
2. `POST /api/transcribe` as section 4.
3. `src/voice/recorder.ts` + Hold to talk.
4. On blob: `transcribeClient.ts` → set StatusBar transcript → Step 5 still keyword-only.
5. Web Speech fallback in `src/voice/webSpeech.ts`: `new webkitSpeechRecognition()`, `lang = "en-US"`, `interimResults = false`, `maxAlternatives = 1`. Use only after Groq failure and `webSpeechFallback === true`.

### Step 5 — LLM proxy + resolver

1. `POST /api/intent` as section 5.
2. `omnirouteClient.ts` + `resolveCommand.ts` (LLM then parser).
3. Wire voice path: transcript → `resolveCommand` → `applyOp`.
4. Parser tests in `tests/intent/keywordParser.test.ts`.

### 9.1 Perfect-shape algorithm (`src/geometry/perfect.ts`)

Only run on selected elements with `type === "freedraw"` (or `"line"` that is a scribble). Rectangles/ellipses already perfect: no-op success, say `Already a shape.` **Assumption:** non-ink selected with `shape: "auto"` is a no-op, not an error. Named override (`shape: "rectangle"`) **rebuilds** a rectangle from the element bbox even if it is already an ellipse.

For each selected freedraw:

1. Read `points` (relative to `x,y`). Absolute pts = `[x+px, y+py]`.
2. `perimeter` = sum of segment lengths. `closeDist` = distance first↔last.
3. `closed` = `closeDist < 0.15 * perimeter` **or** `closeDist < 24` (A12).
4. Bounding box `w,h` from points. Skip if `w < 8 || h < 8` → `couldnt_snap`.
5. If `args.shape` is not `auto`, force that type using the bbox (ellipse fills bbox; rectangle fills bbox; diamond is a diamond inscribed in bbox; line is first→last).
6. If `auto` and **not** closed: fit a least-squares line. If RMS error `< 0.08 * max(w,h)` (A12) → `line` from first to last. Else `couldnt_snap`.
7. If `auto` and closed:
   - Circularity `4 * π * area / perimeter²` (shoelace area). If `≥ 0.82` → `ellipse`.
   - Else sample 8 bbox edge midpoints + 4 corners; if median distance of points to rectangle border `< 0.12 * min(w,h)` → `rectangle`.
   - Else if median distance to diamond (rhombus through bbox mid-edges) `< 0.12 * min(w,h)` → `diamond`.
   - Else `couldnt_snap`.

If **every** selected ink is `couldnt_snap` → `{ ok:false, reason:"couldnt_snap" }`. If mix: convert the ones that work, leave others, still `ok:true` with say `Perfected the selection.` **Assumption:** mixed selection does not fail the whole op.

---

## 10. Verification

Do not claim a step done without the matching checks.

### 10.1 Unit tests (`npm test`)

**`tests/geometry/align.test.ts`**
1. Two rects at `(0,0,100,50)` and `(80,40,100,50)` → align left → both `x === 0`. Unselected third rect unchanged (`toBe`).
2. One selected → `reason === "need_multi"`.
3. Zero ids → `reason === "no_selection"`.

**`tests/geometry/resize.test.ts`**
1. Three rects, `factor 1.25` → each center unchanged (±0.01); each width/height `* 1.25`. They must not share a cluster center (centers stay put).

**`tests/geometry/equalize.test.ts`**
1. Boxes `20×20` and `100×40` → both `100×40`; small box center unchanged.

**`tests/geometry/distribute.test.ts`**
1. Three rects width 10 at x=0, 20, 100 → after H distribute, gaps equal (±0.01). y unchanged.

**`tests/geometry/snap.test.ts`**
1. `{ x: 13, y: 27, width: 41, height: 19 }` grid 20 → `{ 20, 20, 40, 20 }` (width 41→40, height 19→20).

**`tests/geometry/rotate.test.ts`**
1. `angle: 0` + 90° → `angle === Math.PI/2`.

**`tests/geometry/connect.test.ts`**
1. Two rects → result contains exactly one new `type==="arrow"`; original two still present with same `x,y`.
2. Three ids → two arrows.

**`tests/geometry/perfect.test.ts`**
1. Closed 32-point unit circle (scaled) → `ellipse`.
2. Closed 4-point rectangle with dense edge samples → `rectangle`.
3. Open nearly-colinear points → `line`.
4. Random scribble (20 noisy points, not closed) → `couldnt_snap` when it is the only selection.
5. `shape: "ellipse"` override on a boxy closed stroke → `ellipse`.
6. Color `#c92a2a` and `strokeWidth: 2` preserved on the replacement.

**`tests/intent/keywordParser.test.ts`** — one assert per row in the §7.7 table, plus:
- `"ALIGN LEFT!!!"` → align left
- `"please perfectly this"` → perfect auto
- `"draw me aws"` → unknown

### 10.2 curl against the proxy

Dev server running (`npm run dev`). Use a tiny valid webm/wav. If you have no audio fixture, skip the file test and still hit the missing-key path.

```bash
# Missing Groq key → 401
curl -sS -o /tmp/t.json -w "%{http_code}" http://localhost:5173/api/transcribe
# expect 401 and {"error":"missing_groq_key"}

# Happy Groq (needs GROQ_API_KEY in env or -H)
curl -sS http://localhost:5173/api/transcribe \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file="@/path/to/align-left.webm;filename=utterance.webm;type=audio/webm" \
  -F model="whisper-large-v3-turbo" \
  -F language="en" \
  -F temperature="0" \
  -F response_format="json" \
  -F prompt="perfect this, align left, snap to grid"
# expect {"text":"..."}  (must contain some English)

# Filename without extension must not be sent by our client.
# Manual negative (optional): Groq 400 if you force filename "blob".

# OmniRoute intent
curl -sS http://localhost:5173/api/intent \
  -H "Authorization: Bearer $OMNIROUTE_API_KEY" \
  -H "X-OmniRoute-Base: http://localhost:20128" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "opencode-go/deepseek-v4-pro",
    "temperature": 0,
    "stream": false,
    "response_format": {"type":"json_object"},
    "messages": [
      {"role":"system","content":"Return JSON {op,args,confidence,say}. op=align args.edge=left for align left."},
      {"role":"user","content":"{\"transcript\":\"align left\",\"selectionCount\":2}"}
    ]
  }'
# expect choices[0].message.content JSON with op=align
```

OmniRoute must already be running locally with an OpenCode Go DeepSeek connection. If it is down, curl should return the upstream connection error (proxy must not swallow it as 200).

### 10.3 Browser flow (manual; empty keys first)

**A. No keys (must pass before merging voice)**

1. `npm run dev` → canvas fills the page under the chrome. Native Excalidraw draw/select/undo work.
2. Draw a sloppy circle (freedraw) and two sloppy boxes.
3. Select nothing → click **Perfect** → toast `Select a shape first.` Board unchanged.
4. Select the circle → **Perfect** → clean ellipse; same color/width. Ctrl/Cmd+Z restores ink.
5. Select the two boxes → **Align ▾ → Left** → left edges line up. Unselected circle does not move.
6. Select both boxes → **Connect** → one arrow. Undo removes the arrow.
7. Select three boxes → **Bigger** → each grows in place (gaps do not explode as one group).
8. Type `align left` in the command box with 2 selected → same as the button.
9. Type `asdfgh` → toast `Didn’t catch that. Try: perfect this, align left, snap to grid.`
10. Reload → scene still there (localStorage).
11. Open Settings → labels match section 3 → Close without save → keys stay empty. Buttons still work.

**B. With Groq key only**

12. Save Groq key. Hold to talk, say “perfect this” with a freedraw selected → transcript appears → shape perfects (keyword parser; OmniRoute unused).
13. Deny mic in the browser → toast `Microphone blocked. Allow mic access, or use the toolbar.` Buttons still work.

**C. With Groq + OmniRoute**

14. Save OmniRoute URL `http://localhost:20128` + key. Say “center these horizontally” with 2+ selected → align `centerH`. Last command updates.
15. Stop OmniRoute, say a paraphrase the keyword parser might miss → unknown toast, board unchanged.
16. Break Groq key, leave Web Speech on (Chrome) → toast `Groq failed. Try speaking again (browser speech).` then a second utterance can still run.

**D. Regression**

17. After voice ops, unselected elements have not moved.  
18. Excalidraw’s own rectangle tool and undo still work.

### 10.4 Done when

- `npm test` green.
- Browser checklist A (no keys) green.
- curl 401 missing Groq key works even without a Groq account.
- Checklist B/C green on a machine that has keys; if keys are absent in CI, document that B/C are manual.

---

## 11. `vite.config.ts` proxy mount (copy)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { diagramProxyPlugin } from "./server/proxy";

export default defineConfig({
  plugins: [react(), diagramProxyPlugin()],
});
```

`server/proxy.ts` exports a Vite plugin:

- `configureServer(server) { server.middlewares.use("/api/transcribe", handleTranscribe); server.middlewares.use("/api/intent", handleIntent); }`
- Same in `configurePreviewServer`.
- Read raw body for `/api/intent` (JSON). For `/api/transcribe`, buffer the incoming request and forward with the same `content-type` header (boundary).
- Timeouts: 30s STT, 60s intent. On abort, return `504` `{ "error": "upstream_timeout" }`.

---

## 12. Out of scope (do not implement in v1)

Icon library, text-to-diagram, vision, Rumik/Silk TTS, numbered targeting, multiplayer, accounts, non-English, forking Excalidraw, shipping OpenCode, generating whole diagrams from a speech dump.
