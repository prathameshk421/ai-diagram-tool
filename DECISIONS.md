# DECISIONS

**This file is for the agent.** Record why a stack, library, test, or design was chosen. Add a section whenever you decide something non-obvious.

## Product domain

Software / system architecture diagrams (system design, AI/ML pipelines, cloud infra). Not building floor plans.

## Canvas

Embed `@excalidraw/excalidraw` as a React component. Do not fork the editor. Targeting is the user’s current selection, not numbered overlays or an LLM guessing from a screenshot.

Shape correction uses the selected element’s point array and math. No vision model.

## Stack: React + FastAPI + Mongo (MERN, Express later)

The intended long-term shape is MERN (MongoDB, Express, React, Node) **plus** a Python service.

**Right now we use FastAPI instead of Express.** Python is already the plan for later geometry/intent helpers (and optional numpy). One API is enough for the first web layout. Express can sit in front or beside FastAPI later if we need Node-specific work; that is not started.

| Piece | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript | Excalidraw ships as a React component; Vite is the usual host |
| API | FastAPI | Requested for now; simple JSON, CORS, async Mongo later |
| DB | MongoDB | Document store matches an Excalidraw scene JSON blob |
| Voice v1 | Web Speech API in the browser | No backend, no API key, matches local-first demo |
| Geometry v1 | Frontend TypeScript | Selection lives in the editor; no need to round-trip points yet |

## What v1 will not do

No text-to-diagram, no whole-board generation from a monologue, no Rumik/Ira-style talking companion, no icon library, English commands only.

## Tests

Backend: a small FastAPI TestClient check on `/api/health` so the layout is not a dead folder. Frontend tests wait until Excalidraw is actually mounted.
