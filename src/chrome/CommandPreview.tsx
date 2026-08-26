import type { Command } from "../intent/types";

type Props = {
  command: Command | null;
};

export function CommandPreview({ command }: Props) {
  return (
    <section className="preview" aria-label="Command JSON">
      <h2>Command</h2>
      <pre>
        {command
          ? JSON.stringify(command, null, 2)
          : "Last command: —"}
      </pre>
    </section>
  );
}
