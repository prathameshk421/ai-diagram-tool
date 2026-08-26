import type { EditToolCall } from "../edit";

const MAX_CALLS = 8;

const BUILD_TOOLS = new Set<EditToolCall["tool"]>([
  "ask",
  "add_node",
  "insert_on_path",
  "add_edge",
  "remove_node",
  "merge_nodes",
  "set_node",
  "update_edge",
  "remove_edge",
  "align",
  "distribute",
  "equalize",
  "snap",
  "place",
  "beautify",
  "convert_ink",
  "tidy_layout",
  "unoverlap",
  "restyle_icons",
  "annotate_path",
  "unpin",
  "bump_size",
  "rotate",
]);

const GEOMETRY_KEYS = new Set([
  "pin",
  "x",
  "y",
  "width",
  "height",
  "points",
  "cx",
  "cy",
]);

export function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasGeometry(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasGeometry);
  if (!isRecord(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (GEOMETRY_KEYS.has(key)) return true;
    if (hasGeometry(child)) return true;
  }
  return false;
}

function isBuildTool(value: unknown): value is EditToolCall["tool"] {
  return typeof value === "string" && BUILD_TOOLS.has(value as EditToolCall["tool"]);
}

/** Unknown tool, geometry keys, or more than maxCalls → null. */
export function parseEditCalls(
  rawCalls: unknown,
  maxCalls: number,
): EditToolCall[] | null {
  if (!Array.isArray(rawCalls)) return null;
  if (rawCalls.length > maxCalls) return null;
  const calls: EditToolCall[] = [];
  for (const item of rawCalls) {
    if (!isRecord(item) || !isBuildTool(item.tool) || !isRecord(item.args)) {
      return null;
    }
    if (hasGeometry(item.args)) return null;
    calls.push({ tool: item.tool, args: item.args } as EditToolCall);
  }
  return calls;
}

/** Valid build JSON only. Unknown tool, geometry keys, or >8 calls → null. */
export function parseBuild(
  raw: string,
): { calls: EditToolCall[]; say: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.say !== "string") return null;
  const calls = parseEditCalls(parsed.calls, MAX_CALLS);
  if (!calls) return null;
  return { calls, say: parsed.say };
}
