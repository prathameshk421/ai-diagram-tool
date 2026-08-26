import { isCommand } from "../../intent/types";
import type { EnhancerOutput } from "../pipeline/session";

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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Valid enhancer JSON only. Invalid or fenced garbage → null. */
export function parseEnhancer(raw: string): EnhancerOutput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.status !== "string") return null;

  if (parsed.status === "ready") {
    if (typeof parsed.summary !== "string") return null;
    if (!isStringArray(parsed.targetQueries)) return null;
    const ready: Extract<EnhancerOutput, { status: "ready" }> = {
      status: "ready",
      summary: parsed.summary,
      targetQueries: parsed.targetQueries,
    };
    if (parsed.hints !== undefined) {
      if (!isRecord(parsed.hints)) return null;
      ready.hints = parsed.hints;
    }
    if (parsed.command !== undefined && parsed.command !== null) {
      const command = isCommand(parsed.command);
      if (!command) return null;
      ready.command = command;
    }
    return ready;
  }

  if (parsed.status === "ask") {
    if (
      parsed.kind !== "selection" &&
      parsed.kind !== "text" &&
      parsed.kind !== "either"
    ) {
      return null;
    }
    if (typeof parsed.say !== "string") return null;
    const ask: Extract<EnhancerOutput, { status: "ask" }> = {
      status: "ask",
      kind: parsed.kind,
      say: parsed.say,
    };
    if (parsed.candidates !== undefined) {
      if (!isStringArray(parsed.candidates)) return null;
      ask.candidates = parsed.candidates;
    }
    return ask;
  }

  if (parsed.status === "refuse") {
    if (typeof parsed.reason !== "string" || typeof parsed.say !== "string") {
      return null;
    }
    return { status: "refuse", reason: parsed.reason, say: parsed.say };
  }

  return null;
}
