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

type Props = {
  voice: VoiceState;
  transcript: string;
  toast: string;
};

export function StatusBar({ voice, transcript, toast }: Props) {
  return (
    <div className="status">
      <span>{VOICE_LABEL[voice]}</span>
      {transcript ? <span>Transcript: {transcript}</span> : null}
      {toast ? <span className="toast">{toast}</span> : null}
    </div>
  );
}
