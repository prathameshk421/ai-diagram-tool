import type { PendingAsk } from "../agent/pipeline/session";
import { canUseSelection } from "./clarifySelection";

type Props = {
  ask: PendingAsk;
  selection: string[];
  onAnswerSelection: (ids: string[]) => void;
  onCancel: () => void;
};

export function ClarifyPanel({
  ask,
  selection,
  onAnswerSelection,
  onCancel,
}: Props) {
  return (
    <section className="clarify-panel" aria-live="polite">
      <p>{ask.question}</p>
      {ask.candidates.length ? (
        <div className="clarify-chips">
          {ask.candidates.map((id) => (
            <button
              key={id}
              type="button"
              className={selection.includes(id) ? "chip on" : "chip secondary"}
              onClick={() => onAnswerSelection([id])}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        disabled={!canUseSelection(selection)}
        onClick={() => onAnswerSelection(selection)}
      >
        Use selection
      </button>
      <button type="button" className="secondary" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
