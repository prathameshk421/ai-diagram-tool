import { requestIntent } from "./omnirouteClient";
import { MISSING_OMNIROUTE_SAY, unknownCommand, type Command } from "./types";
import type { Settings } from "../settings/store";

export type IntentRequester = (
  settings: Settings,
  transcript: string,
  selectionCount: number,
  selection?: string[],
) => Promise<Command>;

function hasOmniroute(settings: Settings): boolean {
  return Boolean(
    settings.omnirouteUrl.trim() && settings.omnirouteApiKey.trim(),
  );
}

/** Always the LLM. No keyword table. Missing keys → toast, no request. */
export async function resolveCommand(
  text: string,
  selectionCount: number,
  settings: Settings,
  request: IntentRequester = requestIntent,
  selection: string[] = [],
): Promise<Command> {
  if (!text.trim()) return unknownCommand();
  if (!hasOmniroute(settings)) {
    return unknownCommand(MISSING_OMNIROUTE_SAY);
  }
  return request(settings, text, selectionCount, selection);
}
