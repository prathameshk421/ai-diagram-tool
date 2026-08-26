# FLOW

**This file is for the agent.** Describe how the harness actually runs. Update it whenever the path between UI, proxy, and providers changes.

## Processes (dev)

```
Browser  :5173  →  Vite (repo root)
                      │
                      ├── SVG board + chrome (Talk, type-in, Settings)
                      ├── scene persist (localStorage JSON)
                      ├── POST /api/transcribe  →  Groq Whisper
                      └── POST /api/intent      →  OmniRoute {base}/v1/chat/completions
```

1. `npm install && npm run dev` at the **repo root** — current app.
2. Paste Groq and OmniRoute keys in Settings (not `.env` for the proxy).
3. Optional: `npm run test:live` with `GROQ_API_KEY` and `OMNIROUTE_API_KEY` in the test-runner env.

`frontend/` Vite (also :5173) and FastAPI :8000 are a later-layout sketch from `main`. Do not use them for this slice.

## User loop

1. Open Settings and paste keys. Type-in needs OmniRoute; Talk needs Groq + OmniRoute.
2. Draw on the board (box / pen / connect) or use the demo nodes. Select objects. Drag writes `pin`.
3. Type a command **or** click Talk (300ms–15s), then Stop talking.
4. Talk → `POST /api/transcribe` (Groq). Empty text or `no_speech_prob >= 0.6` → unknown; skip OmniRoute.
5. Host undo phrases (`undo`, `put it back`, `undo last kafka bit`) skip OmniRoute and restore a snapshot / journal hunk.
6. Host WONTFIX: a long “build/generate a … architecture/pipeline” paragraph does not write the file and does not call OmniRoute.
7. Otherwise `resolveCommand` always `POST /api/intent` when OmniRoute URL+key are set. Payload: `{ transcript, selectionCount, selection }`.
8. Missing OmniRoute key → toast. No regex fallback.
9. `applyTurn` maps Command JSON (or a JSON Patch) onto the scene through the kernel. Questions return an answer and do not write.
10. Preview shows Command JSON, optional answer, and the **agent-facing** scene (no `ink.points`, plus `view`).

## Scene kernel

```
scene JSON
  → agent patch / Command map   (forbidden: pin.x, width, height, points)
  → passes (one-shot, then cleared)
  → constraints (then cleared)
  → layout unpinned / unlocked
  → validate
  → SVG render from pins + size tokens + route/stroke
```

Human drag does not run OmniRoute. It writes `pin` on the stored scene.

```
Human draw or drag → scene.pin / ink.points → board
Agent Command/patch → kernel → scene → board
Board selection[] → next OmniRoute user payload
```

## Voice

```
Mic → MediaRecorder blob → POST /api/transcribe (Bearer Groq key) → transcript
```

No Web Speech. Missing Groq key → toast; do not record.

## Intent

```
transcript + selectionCount + selection[]
  → OmniRoute chat completions (always, if keys set)
       thinking: { type: "disabled" }
       400 → omit thinking once
       parse choices[0].message.content → Command
  → applyTurn(scene, command, transcript)
```

## Where a bug might live

| Symptom | Look first |
|---|---|
| Type-in does nothing | Empty OmniRoute key; `src/intent/resolveCommand.ts` |
| Talk toasts immediately | Empty Groq key in Settings |
| 401 `missing_groq_key` | Authorization header missing; proxy must not use env |
| Whisper 400 on file | Filename extension (`utterance.webm` / `.ogg` / `.mp4` / `.wav`) |
| “align left” skipped OmniRoute | Keyword table came back; intent must stay LLM-only |
| `thinking: false` | Must be `{ "type": "disabled" }` |
| Live tests 429 loop | Must not retry 429; check `tests/helpers/rateLimitGuard.ts` |
| Agent moved a box | Patch leaked `pin.x` / `x`; see `src/scene/patch.ts` |
| Beautify shuffled the graph | Freeze flags broken; beautify must restyle in place |
| Redis added beside the DB | Insert left a sidecar; must splice the edge |
| Question changed the diagram | `applyTurn` must SHA-stabilize questions |
| Opened the wrong canvas | You ran `frontend/`; use repo-root `npm run dev` |
