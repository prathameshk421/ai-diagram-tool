type ToolbarProps = {
  onCommand: (name: string) => void;
  selectionHint: string;
};

const ACTIONS = ["Perfect", "Align left", "Align center", "Align top"] as const;

export function Toolbar({ onCommand, selectionHint }: ToolbarProps) {
  return (
    <nav className="toolbar">
      {ACTIONS.map((name) => (
        <button key={name} type="button" onClick={() => onCommand(name)}>
          {name}
        </button>
      ))}
      <span className="hint">{selectionHint}</span>
    </nav>
  );
}
