type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function CommandInput({ value, onChange, onSubmit }: Props) {
  return (
    <form
      className="command-input"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type a command (e.g. align left)"
        aria-label="Command"
      />
      <button type="submit">Run</button>
    </form>
  );
}
