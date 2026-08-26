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
2. Paste Groq and OmniRoute keys in Settings (not `.env` for the proxy). Model id is `OMNIROUTE_MODEL` in `.env`.
3. Optional: `npm run test:live` with `GROQ_API_KEY`, `OMNIROUTE_API_KEY`, and `OMNIROUTE_MODEL` in the test-runner env.

`frontend/` Vite (also :5173) and FastAPI :8000 are a later-layout sketch from `main`. Do not use them for this slice.

## User loop

1. Open Settings and paste keys. Type-in needs OmniRoute; Talk needs Groq + OmniRoute.
2. Draw on the board (box / pen / connect) or use the demo nodes. Releasing a box opens the label field. Select objects. Drag writes `pin` only after a 4px threshold.
3. Type a command **or** click Talk (300ms–15s), then Stop talking.
4. Talk → `POST /api/transcribe` (Groq). Empty text or `no_speech_prob >= 0.6` → unknown; skip OmniRoute.
5. After STT succeeds, Talk uses the **same** `submitTranscript` path as type-in (`runText`). Host undo phrases (`undo`, `put it back`, `undo last kafka bit`) skip the pipeline and restore a snapshot / journal hunk. `finishRecording` must release `busyRef` before `submitTranscript` (no double-lock). While `stage === "asking"`, Talk still submits (answers the pending ask, or undo restores history).
6. Everything else goes through `runPipeline` (busy mutex + AbortController). Host WONTFIX / color / split / duplicate-board / questions call `applyTurn` only — **no** enhance/judge/requestCommand.
7. Remaining commands: production `runEnhancer` (OmniRoute JSON + host `bindReferents`). Enhancer payload includes pin-free `projectForAgentSafe(scene)`. Valid `enhance.command` applies immediately (skips judge/`requestCommand`). Else `runJudge` routes `command` → `resolveCommand`, `build` → `runBuild`+`verifyEdit`, or `plan` → `runPlan`+`reviewPlan` then the same tool loop. No keyword table. Empty OmniRoute key → enhancer refuse, no fetch.
8. Missing OmniRoute key → toast. No regex fallback.
9. Before apply, if `getLiveHash()` ≠ start `sceneHash` → no write (`Board changed — try again.`). Role 500/abort → no write, unknown.
10. `applyTurn` maps Command JSON onto the scene through `desugarCommand` + `applyEditPlan` (or a JSON Patch). Questions return an answer and do not write. Pipeline `ask` always carries `pending` (including deictic/host asks) and opens **ClarifyPanel**. Empty-candidate deictic asks complete via **Use selection** (board ids → `runText(originalTranscript)`). Toast is not the ask surface. App applies `sceneAfterPipeline(live, out)` so a no-write result cannot roll back human edits.
11. Preview shows Command JSON, or Pipeline JSON when `trace.stage !== "idle"`, optional answer, and the **UI** scene copy (`projectForAgent`: no `ink.points`, plus `view`; pins may remain). LLM payloads use `projectForAgentSafe` (pins stripped too).
12. While stage is running (not idle/asking): Run, Talk, and Undo are disabled; ⌘Z is ignored. Esc cancels. Human draw during ask is allowed.

## Scene kernel

```
scene JSON
  → Command → desugarCommand → applyEditPlan tools
    (or JSON Patch, denylist: pin.x, width, height, points, selection, lastDrawn, schema, view)
  → compile after each tool; any failure rolls back the original scene
  → passes (one-shot, then cleared)
  → constraints (then cleared)
  → layout unpinned / unlocked
  → validate
  → SVG render from pins + size tokens + route/stroke
```

Human drag does not run OmniRoute. It writes `pin` on the stored scene.

```
Human draw or drag → scene.pin / ink.points → board
Agent EditToolCall[] / Command / patch → kernel → scene → board
Board selection[] → next OmniRoute user payload
```

## Voice

```
Mic → MediaRecorder blob → POST /api/transcribe (Bearer Groq key) → transcript
  → submitTranscript (same as type-in: host undo / runPipeline with pending)
```

No Web Speech. Missing Groq key → toast; do not record. Spoken undo must not call `executePipeline` alone — that host-skips to unknown and never restores.

## Intent

```
type-in / Talk transcript  (Talk after STT → same submitTranscript as type-in)
  → host undo? (App history; spoken undo included)
  → runPipeline(scene snapshot, getLiveHash, pending, signal)
       host question / whole-board / color / split / duplicate
         → applyTurn only (0 LLM calls)
       else enhance = runEnhancer → requestChatRole(role enhancer) + parse JSON
         payload { transcript, selection, lastDrawn, pending, followUpTo, scene: projectForAgentSafe }
         host bindReferents(scene, targetQueries) after the LLM (never inside the model)
         ask → ClarifyPanel, no write
         refuse → unknown, no write
         ready + valid command → applyTurn (skip requestCommand)
         ready else judge = runJudge → requestChatRole(role judge)
           overlay: usableCommand → command; structural hint without multiStep → build (never default plan on LLM failure)
           command → requestCommand = resolveCommand → requestIntent
           build → runBuild (role build, projectForAgentSafe scene, errors from last fail)
             applyEditPlan + verifyEdit via shared runToolLoop
             pass → write; ask remediation → original scene + ClarifyPanel
             rebuild fail → retry build (max TURN_CAPS.maxVerifyAttempts = 2)
             still fail / 500 / invalid JSON → original scene, wrote false
           plan → runPlan (role plan, projectForAgentSafe scene, rejectReasons)
             parsePlan → reviewPlan (code). Optional reviewLlm only if deps.reviewLlm (App does not wire)
             reject → one replan (TURN_CAPS.maxReplans = 1) with reasons; second reject → original scene
             approve → runToolLoop(plan.steps, expected=plan.expected) same as build apply+verify
             missing deps.plan / null plan / 500 → unknown, no write
       hash mismatch / abort / throw → no write

requestChatRole(role, system, payload)
  → POST /api/intent  (same headers as today)
       max_tokens + timeout from ROLE_BUDGETS[role]
       thinking: { type: "disabled" }
       400 → omit thinking once (per call)
       500 / 429 → no retry
  → raw choices[0].message.content  (no Command parse)

requestIntent = requestChatRole(role: "command")
  payload { transcript, selectionCount, selection }  — no scene
  4s / 200 tokens
  parse Command JSON; invalid / coords / confidence < 0.45 → unknown
  → applyTurn(scene, command, transcript)

runBuild = requestChatRole(role: "build")
  payload { transcript, intent, scene: projectForAgentSafe, errors }
  12s / 600 tokens
  parse {calls, say}; geometry / unknown tool / >8 calls / HTTP 500 → empty calls

runPlan = requestChatRole(role: "plan")
  payload { transcript, intent, scene: projectForAgentSafe, rejectReasons }
  12s / 800 tokens
  parse {goal, steps, expected?, say}; geometry / unknown tool / steps not in 1–12 / HTTP 500 / missing keys → null
  reviewPlan is host code (no LLM). One replan then fail closed.
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
| Redis added beside the DB | Insert left a sidecar; `verifyEdit` must fail `INSERT_SIDECAR` and rebuild (max 2) or roll back; `reviewPlan` must fail `SIDECAR_INSERT` if the plan also `add_edge`s A→B |
| Plan looped forever | `TURN_CAPS.maxReplans === 1`; second reject returns the original SHA |
| LLM review blocked a good plan | App must not wire `reviewLlm`; deterministic `reviewPlan` is the gate |
| Build wrote after two verify fails | Exhaustion must return the original scene SHA |
| Verify sent a screenshot | Verify is predicates + tool trace only — never an image |
| Question changed the diagram | `applyTurn` must SHA-stabilize questions |
| Ask only flashed a toast | Pipeline `ask` must set `pendingAsk` + ClarifyPanel |
| Spoken “undo” did nothing | Talk must `submitTranscript` / `runText`, not `executePipeline`; `runPipeline` host-skips undo to unknown |
| Deictic ask stuck with empty chips | ClarifyPanel **Use selection** (App chrome; orchestrator does not consume it) |
| Align left skipped OmniRoute without an LLM | Host regex for align/perfect; valid `enhance.command` **is allowed** to skip `requestCommand` |
| Enhancer invented node ids | Host `bindReferents` must run after the LLM; payload must be `projectForAgentSafe` |
| Judge defaulted to plan on 500 | `runJudge` fallback is `command`, never plan |
| Edit applied after a drag | `getLiveHash` / `liveHash` gate before apply |
| Opened the wrong canvas | You ran `frontend/`; use repo-root `npm run dev` |
| Box has no label field / typing goes nowhere | SVG captured the pointer; capture is drag-only, see `src/canvas/Board.tsx` |
| Pen stroke vanished | No `pointermove`; up-point must be appended before `commitPenStroke` |
