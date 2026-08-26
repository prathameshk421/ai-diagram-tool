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
