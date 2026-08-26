import { projectForAgentSafe } from "../../scene/project";
import type { Scene } from "../../scene/types";
import { requestChatRole } from "../../intent/omnirouteClient";
import { MISSING_OMNIROUTE_SAY, unknownCommand } from "../../intent/types";
import type { Settings } from "../../settings/store";
import type { EnhancerOutput, PendingAsk } from "../pipeline/session";
import { bindReferents } from "./bindReferents";
import { ENHANCER_PROMPT } from "./enhancerPrompt";
import { parseEnhancer } from "./parseEnhancer";

export type RoleRequester = typeof requestChatRole;

function hasOmniroute(settings: Settings): boolean {
  return Boolean(
    settings.omnirouteUrl.trim() && settings.omnirouteApiKey.trim(),
  );
}

function llmRefuse(): EnhancerOutput {
  return { status: "refuse", reason: "llm", say: unknownCommand().say };
}

export async function runEnhancer(opts: {
  settings: Settings;
  transcript: string;
  scene: Scene;
  pending: PendingAsk | null;
  followUpTo: string | null;
  request?: RoleRequester;
  signal?: AbortSignal;
}): Promise<EnhancerOutput> {
  if (!hasOmniroute(opts.settings)) {
    return {
      status: "refuse",
      reason: "missing_key",
      say: MISSING_OMNIROUTE_SAY,
    };
  }

  const request = opts.request ?? requestChatRole;
  const result = await request({
    settings: opts.settings,
    role: "enhancer",
    system: ENHANCER_PROMPT,
    payload: {
      transcript: opts.transcript,
      selection: opts.scene.selection,
      lastDrawn: opts.scene.lastDrawn,
      pending: opts.pending,
      followUpTo: opts.followUpTo,
      scene: projectForAgentSafe(opts.scene),
    },
    signal: opts.signal,
  });

  if (!result.ok) return llmRefuse();
  const parsed = parseEnhancer(result.content);
  if (!parsed) return llmRefuse();
  if (parsed.status !== "ready") return parsed;

  const bound = bindReferents(opts.scene, parsed.targetQueries);
  if (bound.status === "ask") {
    return {
      status: "ask",
      kind: "selection",
      say: bound.say,
      candidates: bound.candidates,
    };
  }
  return { ...parsed, ids: bound.ids };
}
