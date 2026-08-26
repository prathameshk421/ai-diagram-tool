/** Host-owned channels. Not an intent keyword table. */

export function hostUndoKind(
  transcript: string,
): "full" | { hunk: string } | null {
  const t = transcript.trim();
  const hunk = t.match(/^undo last (.+?)(?: bit)?\.?$/i);
  if (hunk) return { hunk: hunk[1].trim() };
  if (/^(undo|put it back|put that back)\b/i.test(t)) return "full";
  return null;
}

export function isDuplicateBoardAsk(transcript: string): boolean {
  return /another version beside|duplicate (this |the )?(diagram|board)/i.test(
    transcript,
  );
}

/** Long “generate/build the whole architecture” prompts must not write. */
export function isWholeBoardGen(transcript: string): boolean {
  const t = transcript.trim();
  if (t.length < 40) return false;
  const wantsBuild =
    /\b(generate|create|build|draw|design|make me|architect)\b/i.test(t);
  const wantsBoard =
    /\b(architecture|diagram|pipeline|rag|whole (board|diagram)|system design)\b/i.test(
      t,
    );
  return wantsBuild && wantsBoard;
}

export function isColorQuery(transcript: string): boolean {
  return (
    /\b(blue|red|green|yellow|orange|purple|pink|black|white|grey|gray)\b/i.test(
      transcript,
    ) && /\b(the|this|that|one)\b/i.test(transcript)
  );
}

export function isSplitAsk(transcript: string): boolean {
  return /\bsplit\b.+\b(out of|from)\b/i.test(transcript);
}

export const WHOLE_BOARD_SAY =
  "v1 does not generate a whole diagram from a paragraph. Draw or name one change at a time.";
export const COLOR_SAY = "v1 cannot target by color.";
export const SPLIT_SAY = "Which edges should move with the split? Name them.";
