import type { BoardTool } from "./geometry";

type Props = {
  tool: BoardTool;
  onTool: (tool: BoardTool) => void;
};

const TOOLS: { id: BoardTool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "box", label: "Box" },
  { id: "pen", label: "Pen" },
  { id: "connect", label: "Connect" },
];

export function BoardToolbar({ tool, onTool }: Props) {
  return (
    <div className="board-toolbar" role="toolbar" aria-label="Board tools">
      {TOOLS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={tool === item.id ? "tool on" : "tool"}
          aria-pressed={tool === item.id}
          onClick={() => onTool(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
