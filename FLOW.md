# FLOW

**This file is for the agent.** Describe how the harness actually runs. Update it whenever the path between UI, proxy, and providers changes.

## Processes (dev)

```
Browser  :5173  →  Vite (repo root)
                      │
                      ├── harness UI (Talk, type-in, Settings, Command JSON)
                      ├── POST /api/transcribe  →  Groq Whisper
                      └── POST /api/intent      →  OmniRoute {base}/v1/chat/completions
```

1. `npm install && npm run dev` at the **repo root** — current app.
2. Paste Groq and OmniRoute keys in Settings (not `.env` for the proxy).
3. Optional: `npm run test:live` with `GROQ_API_KEY` and `OMNIROUTE_API_KEY` in the test-runner env.

`frontend/` Vite (also :5173) and FastAPI :8000 are a later-layout sketch from `main`. Do not use them for this slice.

## User loop (this slice)

1. Optional: open Settings and paste keys. Type-in works with empty keys.
2. Type a command **or** click Talk (300ms–15s), then Stop talking.
3. Talk → `POST /api/transcribe` (Groq). Empty text or `no_speech_prob >= 0.6` → unknown; skip OmniRoute.
4. `resolveCommand`: keyword parser first.
5. Parser hit, or bare align/distribute (`confidence === 0.8`) → that Command; no LLM.
6. True miss and OmniRoute URL+key set → `POST /api/intent`.
7. Preview shows Command JSON. Nothing is drawn.

## Voice

```
Mic → MediaRecorder blob → POST /api/transcribe (Bearer Groq key) → transcript
```

No Web Speech. Missing Groq key → toast; do not record.

## Intent

```
transcript + selectionCount
  → keywordParser
  → on unknown/confidence 0 and keys set: OmniRoute chat completions
       thinking: { type: "disabled" }
       400 → omit thinking once
       parse choices[0].message.content → Command
```

## Where a bug might live

| Symptom | Look first |
|---|---|
| Type-in does nothing | `src/intent/keywordParser.ts` / `resolveCommand.ts` |
| Talk toasts immediately | Empty Groq key in Settings |
| 401 `missing_groq_key` | Authorization header missing; proxy must not use env |
| Whisper 400 on file | Filename extension (`utterance.webm` / `.ogg` / `.mp4` / `.wav`) |
| LLM ran on “align left” | Keywords-first broken |
| `thinking: false` | Must be `{ "type": "disabled" }` |
| Live tests 429 loop | Must not retry 429; check `tests/helpers/rateLimitGuard.ts` |
| Opened a canvas | You ran `frontend/`; use repo-root `npm run dev` |
