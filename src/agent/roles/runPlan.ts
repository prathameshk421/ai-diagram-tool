import { projectForAgentSafe } from "../../scene/project";
import type { Scene } from "../../scene/types";
import { requestChatRole } from "../../intent/omnirouteClient";
import type { Settings } from "../../settings/store";
import type { EnhancerOutput } from "../pipeline/session";
import { PLAN_PROMPT } from "./planPrompt";
import { parsePlan, type AgentPlan } from "./parsePlan";

export type RoleRequester = typeof requestChatRole;

function hasOmniroute(settings: Settings): boolean {
  return Boolean(
    settings.omnirouteUrl.trim() && settings.omnirouteApiKey.trim(),
  );
}

export async function runPlan(opts: {
  settings: Settings;
  transcript: string;
  intent: Extract<EnhancerOutput, { status: "ready" }>;
  scene: Scene;
  rejectReasons?: unknown;
  request?: RoleRequester;
  signal?: AbortSignal;
}): Promise<AgentPlan | null> {
  if (!hasOmniroute(opts.settings)) return null;

  const request = opts.request ?? requestChatRole;
  const result = await request({
    settings: opts.settings,
    role: "plan",
    system: PLAN_PROMPT,
    payload: {
      transcript: opts.transcript,
      intent: opts.intent,
      scene: projectForAgentSafe(opts.scene),
      rejectReasons: opts.rejectReasons,
    },
    signal: opts.signal,
  });

  if (!result.ok) return null;
  return parsePlan(result.content);
}
