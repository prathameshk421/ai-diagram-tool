type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  mode?: "command" | "answer";
  disabled?: boolean;
};

export function CommandInput({
  value,
  onChange,
  onSubmit,
  mode = "command",
  disabled = false,
}: Props) {
  const answer = mode === "answer";
  return (
    <form
      className="command-input"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSubmit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          answer
            ? "Answer the question…"
            : "Type a command (e.g. align left, make it nicer)"
        }
        aria-label={answer ? "Answer clarification" : "Command"}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled}>
        {answer ? "Answer" : "Run"}
      </button>
    </form>
  );
}
