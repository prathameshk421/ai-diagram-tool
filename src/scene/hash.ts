/** Stable FNV-1a hex of canonical JSON. Used to prove question turns do not write. */
export function sceneHash(value: unknown): string {
  const json = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
