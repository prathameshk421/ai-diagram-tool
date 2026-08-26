import { projectForAgentSafe } from "../../scene/project";
import type { Scene } from "../../scene/types";
import { requestChatRole } from "../../intent/omnirouteClient";
import { MISSING_OMNIROUTE_SAY, unknownCommand } from "../../intent/types";
import type { Settings } from "../../settings/store";
import type { EditToolCall } from "../edit";
import type { EnhancerOutput } from "../pipeline/session";
import { BUILD_PROMPT } from "./buildPrompt";
import { parseBuild } from "./parseBuild";

export type RoleRequester = typeof requestChatRole;

function hasOmniroute(settings: Settings): boolean {
  return Boolean(
    settings.omnirouteUrl.trim() && settings.omnirouteApiKey.trim(),
  );
}

function emptyFail(say = unknownCommand().say): {
  calls: EditToolCall[];
  say: string;
} {
  return { calls: [], say };
}

export async function runBuild(opts: {
  settings: Settings;
  transcript: string;
  intent: Extract<EnhancerOutput, { status: "ready" }>;
  scene: Scene;
  errors?: unknown;
  request?: RoleRequester;
  signal?: AbortSignal;
}): Promise<{ calls: EditToolCall[]; say: string }> {
  if (!hasOmniroute(opts.settings)) {
    return {
      calls: [{ tool: "ask", args: { say: MISSING_OMNIROUTE_SAY } }],
      say: MISSING_OMNIROUTE_SAY,
    };
  }

  const request = opts.request ?? requestChatRole;
  const result = await request({
    settings: opts.settings,
    role: "build",
    system: BUILD_PROMPT,
    payload: {
      transcript: opts.transcript,
      intent: opts.intent,
      scene: projectForAgentSafe(opts.scene),
      errors: opts.errors,
    },
    signal: opts.signal,
  });

  if (!result.ok) return emptyFail();
  const parsed = parseBuild(result.content);
  if (!parsed) return emptyFail();
  return parsed;
}
