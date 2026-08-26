import type { JudgeOutput } from "../pipeline/session";

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Valid judge JSON only. Invalid → null (caller falls back to command, never plan). */
export function parseJudge(raw: string): JudgeOutput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (
    parsed.route !== "command" &&
    parsed.route !== "build" &&
    parsed.route !== "plan"
  ) {
    return null;
  }
  if (typeof parsed.reason !== "string") return null;
  return { route: parsed.route, reason: parsed.reason };
}
