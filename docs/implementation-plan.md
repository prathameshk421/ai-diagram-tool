# Agent-path implementation plan

Voice → Groq Whisper → structured `Command` JSON. OmniRoute interprets **every** command. **No keyword table. No drawing surface in this slice.**

**Verdict: FULL GO** for the agent path. Canvas, geometry, and scene mutation are a later harness: agents will call tools against an agent-optimized scene model, not a raw editor dump. This file freezes the Command contract those tools will use.

A junior engineer should be able to implement this file top-to-bottom without inventing product behavior.

---

## Locked (do not reopen)

1. `"thinking": { "type": "disabled" }` on every intent body. Never `thinking: false`. HTTP 400 → omit `thinking` once. No other retries.
2. Model id is `OMNIROUTE_MODEL` from `.env`. No Settings model picker.
3. Settings stores keys and OmniRoute URL only. The intent body `model` field is the env id.
4. Pure AI. Voice and type-in call `resolveCommand`, which always POSTs `/api/intent` when OmniRoute URL+key are set. No keyword/regex shortcut. Missing keys → toast.
5. Same-origin Vite proxy only. No Web Speech. No env-key fallback.
6. This PR ships STT + LLM + harness preview. It does **not** ship a board, geometry, or scene persist.
7. STT = Groq `whisper-large-v3-turbo` via `POST /api/transcribe`, `verbose_json`. Empty text or `no_speech_prob >= 0.6` → skip LLM.
8. Intent omits `response_format`. Client abort: STT **8s**, intent **4s**. Proxy 30s / 60s → `504 {"error":"upstream_timeout"}`.
9. Click-to-toggle Talk only. Clip **300ms–15s**. No hold-to-talk.
10. LLM never emits coordinates, ids, or scene patches. Payload is `{ transcript, selectionCount }`. `selectionCount` is a harness number field until a canvas exists.
11. Settings persist `localStorage` key `ai-diagram-tool:settings` only.
12. Groq/OmniRoute down = toast + unknown. Do not cut STT/LLM code. Do not add a keyword floor.
13. Invalid LLM / coords / `confidence < 0.45` → unknown. Parse `choices[0].message.content` only.
14. We do **not** ship a model vendor CLI. User wires `OMNIROUTE_MODEL` in the OmniRoute dashboard.
15. English only. Command ops: perfect, align, distribute, snap, bigger, smaller, equalize, connect, rotate, unknown.

---

## 0. Assumptions

| ID | Assumption | Default |
|---|---|---|
| A1 | Keys live in Settings only. Proxy must not read env. | Settings only |
| A2 | Default OmniRoute URL | `http://localhost:20128` (no trailing slash) |
| A6 | Align/distribute with no axis | LLM returns unknown + hint; do not invent an axis |
| A9 | LLM miss/invalid/timeout | unknown; do not fall back to regex |
| A11 | Voice and type-in | same `resolveCommand` |
| A13 | `/api/intent` forwards to Settings URL | local demo; strip trailing slash; no allowlist |
| A14 | Test runner | Vitest. No Playwright |
| A15 | `selectionCount` | harness number input, default `1` |

---

## 1. File tree

```
package.json
tsconfig.json
tsconfig.node.json
vite.config.ts
vitest.config.ts
index.html
.env.example          # comment-only: keys are Settings, proxy must not read env
README.md
docs/features.md
docs/implementation-plan.md
src/main.tsx
src/App.tsx
src/styles.css
src/vite-env.d.ts
src/chrome/StatusBar.tsx
src/chrome/SettingsDrawer.tsx
src/chrome/CommandInput.tsx
src/chrome/CommandPreview.tsx
src/voice/recorder.ts
src/voice/transcribeClient.ts
src/intent/types.ts
src/intent/systemPrompt.ts
src/intent/omnirouteClient.ts
src/intent/resolveCommand.ts
src/settings/store.ts
server/proxy.ts
tests/intent/resolveCommand.test.ts
```

**Do not create:** `src/geometry/**`, `src/persist/scene.ts`, canvas editor packages, Web Speech, keyword parser, OpenCode config, Docker.

### Scaffold

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest
```

Scripts: `"dev": "vite"`, `"build": "tsc -b && vite build"`, `"preview": "vite preview"`, `"test": "vitest run"`.

`vite.config.ts` mounts `diagramProxyPlugin()` from `server/proxy.ts` on `configureServer` and `configurePreviewServer`.

`.env.example`:

```
# Keys are pasted in the in-app Settings drawer.
# The Vite proxy must not read GROQ_API_KEY or OMNIROUTE_API_KEY from the environment.
```

---

## 2. Data flow

```
0. selectionCount comes from the harness number input (stub). Do not block STT on it.
1. Click Talk → MediaRecorder (first supported mime:
   audio/webm;codecs=opus, audio/webm, audio/ogg, audio/mp4)
2. Click Stop talking → Blob. Discard if < 300ms. Auto-stop at 15s.
3. POST /api/transcribe → Groq. Timeout 8s. Retry 429/5xx only, max 2.
4. verbose_json. Empty text or no_speech_prob >= 0.6 → unknown Command. Skip OmniRoute.
   Else show transcript.
5. resolveCommand(text, selectionCount, settings)
   a. if OmniRoute URL or key empty → unknown toast (no regex)
   b. else POST /api/intent (including "align left")
        400 → omit thinking once
        parse choices[0].message.content
        invalid / coords / confidence < 0.45 → unknown
6. Groq fail → toast. No browser-speech fallback.
7. CommandPreview shows JSON. Do not mutate a scene.
```

---

## 3. Settings

`localStorage["ai-diagram-tool:settings"]`

| Field | Default | UI |
|---|---|---|
| `omnirouteUrl` | `http://localhost:20128` | OmniRoute URL |
| `omnirouteApiKey` | `""` | OmniRoute API key |
| `groqApiKey` | `""` | Groq API key |

`omnirouteModel` is not a Settings field. It is `OMNIROUTE_MODEL` from `.env` (Vite inlines it; live tests read it).

Help: *Keys stay in this browser. The model id is OMNIROUTE_MODEL in .env.*

Save writes and closes. Close discards. Empty keys must Save.

---

## 4. Groq — `POST /api/transcribe`

Never `FormData.append("file", blob)` without a filename extension.

```
file: utterance.webm | .ogg | .mp4
model: whisper-large-v3-turbo
language: en
temperature: 0
response_format: verbose_json
prompt: perfect this, align left, snap to grid, distribute, rotate, connect these
```

`Authorization: Bearer <settings.groqApiKey>`. Empty → `401 {"error":"missing_groq_key"}`. Do not read `process.env`.

---

## 5. OmniRoute — `POST /api/intent`

Do not call if URL or key empty.

Headers: `Authorization: Bearer <omnirouteApiKey>`, `X-OmniRoute-Base: http://localhost:20128`

```json
{
  "model": "<OMNIROUTE_MODEL>",
  "temperature": 0,
  "stream": false,
  "max_tokens": 200,
  "thinking": { "type": "disabled" },
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user", "content": "{\"transcript\":\"clean this up\",\"selectionCount\":1}" }
  ]
}
```

No `response_format`. No `tools`. No history. `model` from Settings.

System prompt must contain the word `json`, the args table, “never emit coordinates”, and one example:

`"align left" → {"op":"align","args":{"edge":"left"},"confidence":0.95,"say":"Aligned left."}`

---

## 6. Command schema (future agent tools)

```ts
export type Op =
  | "perfect" | "align" | "distribute" | "snap"
  | "bigger" | "smaller" | "equalize" | "connect"
  | "rotate" | "unknown";

export type Command = {
  op: Op;
  args: Record<string, unknown>;
  confidence: number;
  say: string;
};
```

| op | args |
|---|---|
| `perfect` | `{ shape?: "auto"\|"ellipse"\|"rectangle"\|"diamond"\|"line" }` default auto |
| `align` | `{ edge: "left"\|"right"\|"top"\|"bottom"\|"centerH"\|"centerV" }` required |
| `distribute` | `{ axis: "h"\|"v" }` required |
| `snap` / `bigger` / `smaller` / `connect` / `unknown` | `{}` |
| `equalize` | `{ dim?: "both"\|"width"\|"height" }` default both |
| `rotate` | `{ degrees?: 90 }` default 90 |

Coordinate-like keys (`x`, `y`, `width`, `height`, `points`) → invalid.

When a canvas exists, each `op` becomes a tool with the same args. The scene representation for that canvas is **not** specified here on purpose: pick an agent-optimized graph later, then bind these tools.

---

## 7. Intent (always LLM)

There is no `keywordParser`. `resolveCommand` only checks that OmniRoute URL+key are set, then calls `requestIntent`.

---

## 8. UI copy

- Talk / Stop talking
- Type-in placeholder: `Type a command (e.g. align left)`
- Selection count label: `Selection count (stub)`
- Voice: `idle` / `listening…` / `transcribing…` / `understanding…` / `no microphone` / `error`
- Unknown: `Didn’t catch that. Try: perfect this, align left, snap to grid.`
- Missing Groq: `Add a Groq API key in Settings.`
- Missing OmniRoute: `Add an OmniRoute API key in Settings.`
- Groq fail: `Couldn’t transcribe. Check the Groq key in Settings.`
- Mic: `Microphone blocked. Allow mic access.`

---

## 9. Implementation order

1. Docs + `types.ts` + `systemPrompt.ts` + README.
2. Harness chrome: Settings, type-in, CommandPreview.
3. `/api/transcribe` + Talk.
4. `/api/intent` + LLM-only `resolveCommand`.

---

## 10. Verification

- `npm test`: `resolveCommand` calls OmniRoute for `"align left"` when keyed; empty key toasts and does not fetch. Payload includes `thinking: { type: "disabled" }` and omits `response_format`.
- curl missing Groq key → 401 with `GROQ_API_KEY` set in the shell.
- Browser: type-in with keys hits `/api/intent`; Talk with empty Groq key does not hit Groq; OmniRoute down → unknown.
- `package.json` has no canvas editor dependency.

---

## 11. Out of scope

Drawing surface, geometry, scene persist, undo on a board, vision, TTS, whole-diagram generation, OpenCode CLI, OmniRoute STT, Web Speech, keyword/regex intent, hold-to-talk, env-key proxy, hosted deploy, tool-calling loops against a live canvas, free-text model field.
