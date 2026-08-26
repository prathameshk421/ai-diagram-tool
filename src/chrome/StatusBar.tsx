import type { PipelineStage } from "../agent/pipeline/session";

type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "understanding"
  | "no-mic"
  | "error";

const VOICE_LABEL: Record<VoiceState, string> = {
  idle: "Voice: idle",
  listening: "Voice: listening…",
  transcribing: "Voice: transcribing…",
  understanding: "Voice: understanding…",
  "no-mic": "Voice: no microphone",
  error: "Voice: error",
};

const STAGE_COPY: Record<PipelineStage, string | null> = {
  idle: null,
  enhancing: "Understanding your request…",
  asking: "Waiting for you",
  judging: "Reviewing diagram…",
  planning: "Planning changes…",
  building: "Drafting edit…",
  verifying: "Verifying…",
  applying: "Applying…",
};

type Props = {
  voice: VoiceState;
  transcript: string;
  toast: string;
  stage?: PipelineStage;
};

export function StatusBar({
  voice,
  transcript,
  toast,
  stage = "idle",
}: Props) {
  const stageLabel = STAGE_COPY[stage];
  return (
    <div className="status">
      <span>{stageLabel ?? VOICE_LABEL[voice]}</span>
      {transcript ? <span>Transcript: {transcript}</span> : null}
      {toast ? <span className="toast">{toast}</span> : null}
    </div>
  );
}
