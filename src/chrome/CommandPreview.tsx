import type { PipelineTrace } from "../agent/pipeline/session";
import type { Command } from "../intent/types";

type Props = {
  command: Command | null;
  trace?: PipelineTrace;
};

export function CommandPreview({ command, trace }: Props) {
  const pipeline = Boolean(trace && trace.stage !== "idle");
  return (
    <section
      className="preview"
      aria-label={pipeline ? "Pipeline" : "Command JSON"}
    >
      <h2>{pipeline ? "Pipeline" : "Command"}</h2>
      <pre>
        {pipeline && trace
          ? JSON.stringify(
              {
                stage: trace.stage,
                judgeRoute: trace.judgeRoute,
                enhancedSummary: trace.enhancedSummary,
                ...(command ? { command } : {}),
              },
              null,
              2,
            )
          : command
            ? JSON.stringify(command, null, 2)
            : "Last command: —"}
      </pre>
    </section>
  );
}
