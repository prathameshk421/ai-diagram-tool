export const OPS = [
  "perfect",
  "align",
  "distribute",
  "snap",
  "bigger",
  "smaller",
  "equalize",
  "connect",
  "rotate",
  "unknown",
] as const;

export type Op = (typeof OPS)[number];

export type Command = {
  op: Op;
  args: Record<string, unknown>;
  confidence: number;
  say: string;
};

export const FLASH_MODEL = "opencode-go/deepseek-v4-flash";
export const PRO_MODEL = "opencode-go/deepseek-v4-pro";

export const ALIGN_EDGES = [
  "left",
  "right",
  "top",
  "bottom",
  "centerH",
  "centerV",
] as const;
export type AlignEdge = (typeof ALIGN_EDGES)[number];

export const DISTRIBUTE_AXES = ["h", "v"] as const;
export type DistributeAxis = (typeof DISTRIBUTE_AXES)[number];

export const PERFECT_SHAPES = [
  "auto",
  "ellipse",
  "rectangle",
  "diamond",
  "line",
] as const;
export type PerfectShape = (typeof PERFECT_SHAPES)[number];

export const EQUALIZE_DIMS = ["both", "width", "height"] as const;
export type EqualizeDim = (typeof EQUALIZE_DIMS)[number];

export const COORDINATE_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "points",
  "cx",
  "cy",
]);

export const UNKNOWN_SAY =
  "Didn’t catch that. Try: perfect this, align left, snap to grid.";
export const MISSING_OMNIROUTE_SAY = "Add an OmniRoute API key in Settings.";

export function unknownCommand(
  say = UNKNOWN_SAY,
  confidence = 0,
): Command {
  return { op: "unknown", args: {}, confidence, say };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCoordinateKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => COORDINATE_KEYS.has(key));
}

function pickArgs(
  allowed: string[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in raw) args[key] = raw[key];
  }
  return args;
}

/** Validates LLM JSON into a Command. Extra args dropped; coordinates fail closed. */
export function isCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null;
  if (hasCoordinateKeys(value)) return null;

  const { op, args, confidence, say } = value;
  if (typeof op !== "string" || !OPS.includes(op as Op)) return null;
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    return null;
  }
  if (typeof say !== "string") return null;

  const rawArgs = args === undefined ? {} : args;
  if (!isRecord(rawArgs)) return null;
  if (hasCoordinateKeys(rawArgs)) return null;

  const commandOp = op as Op;
  if (commandOp === "align") {
    const edge = rawArgs.edge;
    if (typeof edge !== "string" || !ALIGN_EDGES.includes(edge as AlignEdge)) {
      return null;
    }
    return {
      op: commandOp,
      args: { edge },
      confidence,
      say,
    };
  }
  if (commandOp === "distribute") {
    const axis = rawArgs.axis;
    if (
      typeof axis !== "string" ||
      !DISTRIBUTE_AXES.includes(axis as DistributeAxis)
    ) {
      return null;
    }
    return {
      op: commandOp,
      args: { axis },
      confidence,
      say,
    };
  }
  if (commandOp === "perfect") {
    const shape = rawArgs.shape;
    if (shape === undefined) {
      return { op: commandOp, args: { shape: "auto" }, confidence, say };
    }
    if (
      typeof shape !== "string" ||
      !PERFECT_SHAPES.includes(shape as PerfectShape)
    ) {
      return null;
    }
    return { op: commandOp, args: { shape }, confidence, say };
  }
  if (commandOp === "equalize") {
    const dim = rawArgs.dim;
    if (dim === undefined) {
      return { op: commandOp, args: { dim: "both" }, confidence, say };
    }
    if (typeof dim !== "string" || !EQUALIZE_DIMS.includes(dim as EqualizeDim)) {
      return null;
    }
    return { op: commandOp, args: { dim }, confidence, say };
  }
  if (commandOp === "rotate") {
    const degrees = rawArgs.degrees;
    if (degrees === undefined) {
      return { op: commandOp, args: { degrees: 90 }, confidence, say };
    }
    if (degrees !== 90) return null;
    return { op: commandOp, args: { degrees: 90 }, confidence, say };
  }
  return {
    op: commandOp,
    args: pickArgs([], rawArgs),
    confidence,
    say,
  };
}

export function parseCommandJson(raw: string): Command | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return isCommand(JSON.parse(stripped));
  } catch {
    return null;
  }
}
