# DECISIONS

**This file is for the agent.** Record why a stack, library, test, or design was chosen. Add a section whenever you decide something non-obvious.

## Product domain

Software / system architecture diagrams (system design, AI/ML pipelines, cloud infra). Not building floor plans.

## Canvas

Embed `@excalidraw/excalidraw` as a React component. Do not fork the editor. Targeting is the user’s current selection, not numbered overlays or an LLM guessing from a screenshot.

Shape correction uses the selected element’s point array and math. No vision model.

## Stack: React + Firebase + FastAPI

We started with Mongo in Compose. **Switched to Firebase** so production deploy, **Google login**, and saved diagrams live in one Google project (Spark is free to test: 1 GiB, 50k reads/day, 20k writes/day).

MongoDB / Atlas / Express are **not** in the repo. Do not reintroduce them without a new decision.

| Piece | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Excalidraw ships as a React component; Vite is the usual host |
| Auth | Firebase Auth, Google provider | Requested for production; Spark includes Auth |
| DB | Cloud Firestore | Same project as Auth; document JSON fits a scene (watch the 1 MB doc limit) |
| Hosting | Firebase Hosting | Production URL without a separate VPS |
| API | FastAPI | Still useful for later Python geometry/intent; **not** the database |
| Voice v1 | Web Speech API in the browser | Mic stays local; Firebase is not STT |
| Geometry v1 | Frontend TypeScript | Selection lives in the editor |

## Saves vs free quota

Debounce Firestore writes (button or ~30s), never per-stroke. Testing will not hit 20k writes/day. Stay on Spark until we outgrow it.

## What v1 will not do

No text-to-diagram, no whole-board generation from a monologue, no Rumik/Ira-style talking companion, no icon library, English commands only. No live multiplayer.

## Tests

Backend: FastAPI TestClient on `/api/health`. Frontend tests wait until Excalidraw is actually mounted. Auth is skipped in CI until Firebase emulators exist.
