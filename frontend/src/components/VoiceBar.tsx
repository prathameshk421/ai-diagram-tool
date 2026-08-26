type VoiceBarProps = {
  lastCommand: string;
};

export function VoiceBar({ lastCommand }: VoiceBarProps) {
  return (
    <footer className="voice-bar">
      <button type="button" disabled>
        Hold to talk
      </button>
      <span className="hint">last command: {lastCommand}</span>
    </footer>
  );
}
