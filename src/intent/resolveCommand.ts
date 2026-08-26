import { requestIntent } from "./omnirouteClient";
import { keywordParser } from "./keywordParser";
import type { Command } from "./types";
import type { Settings } from "../settings/store";

export type IntentRequester = (
  settings: Settings,
  transcript: string,
  selectionCount: number,
) => Promise<Command>;

export async function resolveCommand(
  text: string,
  selectionCount: number,
  settings: Settings,
  request: IntentRequester = requestIntent,
): Promise<Command> {
  const parsed = keywordParser(text);
  if (parsed.op !== "unknown") return parsed;
  // Bare align/distribute: parser hit at 0.8 — skip LLM.
  if (parsed.confidence === 0.8) return parsed;
  if (!settings.omnirouteUrl.trim() || !settings.omnirouteApiKey.trim()) {
    return parsed;
  }
  return request(settings, text, selectionCount);
}
