import type { EditToolCall } from "../edit";
import { isRecord, parseEditCalls, stripFences } from "./parseBuild";

const MAX_STEPS = 12;

export type AgentPlan = {
  goal: string;
  steps: EditToolCall[];
  expected?: {
    nodesAdded?: string[];
    noEdge?: { from: string; to: string }[];
    hasEdge?: { from: string; to: string }[];
  };
  say: string;
};

function parsePairs(
  value: unknown,
): { from: string; to: string }[] | null {
  if (!Array.isArray(value)) return null;
  const pairs: { from: string; to: string }[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.from !== "string" ||
      typeof item.to !== "string"
    ) {
      return null;
    }
    pairs.push({ from: item.from, to: item.to });
  }
  return pairs;
}

function parseExpected(
  value: unknown,
): AgentPlan["expected"] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const expected: NonNullable<AgentPlan["expected"]> = {};
  if (value.nodesAdded !== undefined) {
    if (
      !Array.isArray(value.nodesAdded) ||
      value.nodesAdded.some((id) => typeof id !== "string")
    ) {
      return null;
    }
    expected.nodesAdded = value.nodesAdded as string[];
  }
  if (value.hasEdge !== undefined) {
    const pairs = parsePairs(value.hasEdge);
    if (!pairs) return null;
    expected.hasEdge = pairs;
  }
  if (value.noEdge !== undefined) {
    const pairs = parsePairs(value.noEdge);
    if (!pairs) return null;
    expected.noEdge = pairs;
  }
  return expected;
}

/** Valid plan JSON only. Geometry keys, unknown tools, or steps not in 1–12 → null. */
export function parsePlan(content: string): AgentPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(content));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed.goal !== "string" || typeof parsed.say !== "string") {
    return null;
  }
  const steps = parseEditCalls(parsed.steps, MAX_STEPS);
  if (!steps || steps.length < 1) return null;
  const expected = parseExpected(parsed.expected);
  if (expected === null) return null;
  const plan: AgentPlan = { goal: parsed.goal, steps, say: parsed.say };
  if (expected) plan.expected = expected;
  return plan;
}
