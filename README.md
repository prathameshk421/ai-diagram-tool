# ai-diagram-tool

Voice-driven Excalidraw architecture diagrammer. Selection is the only target. Geometry is code, not LLM.

- Feature contract: [docs/features.md](docs/features.md)
- Implementation plan (follow this): [docs/implementation-plan.md](docs/implementation-plan.md)

**v1.1 ships the complete app:** Excalidraw canvas + Groq Whisper + OmniRoute OpenCode Go DeepSeek + UI.

Scaffold order is in the plan: canvas + toolbar first (demoable without keys), then STT, then LLM — all in the same ship. Keys are pasted in Settings. No env-key fallback. No Web Speech. Thinking is off. Keywords first.
