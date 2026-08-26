import type { Scene } from "../../scene/types";
import { requestChatRole } from "../../intent/omnirouteClient";
import { isCommand, type Command } from "../../intent/types";
import type { Settings } from "../../settings/store";
import type { EnhancerOutput, JudgeOutput } from "../pipeline/session";
import { JUDGE_PROMPT } from "./judgePrompt";
import { parseJudge } from "./parseJudge";

export type RoleRequester = typeof requestChatRole;

function hasOmniroute(settings: Settings): boolean {
  return Boolean(
    settings.omnirouteUrl.trim() && settings.omnirouteApiKey.trim(),
  );
}

function usableCommand(value: Command | undefined): Command | null {
  if (!value) return null;
  const parsed = isCommand(value);
  if (!parsed) return null;
  if (parsed.confidence < 0.45 || parsed.op === "unknown") return null;
  return parsed;
}

function commandFallback(): JudgeOutput {
  return { route: "command", reason: "fallback" };
}

function overlayJudge(
  intent: Extract<EnhancerOutput, { status: "ready" }>,
  judged: JudgeOutput,
): JudgeOutput {
  if (usableCommand(intent.command)) {
    return { route: "command", reason: "valid-command" };
  }
  const structural = intent.hints?.structural === true;
  const multiStep = Boolean(intent.hints?.multiStep);
  if (judged.route === "plan" && structural && !multiStep) {
    return { route: "build", reason: "structural" };
  }
  return judged;
}

export async function runJudge(opts: {
  settings: Settings;
  transcript: string;
  intent: Extract<EnhancerOutput, { status: "ready" }>;
  scene: Scene;
  request?: RoleRequester;
  signal?: AbortSignal;
}): Promise<JudgeOutput> {
  if (!hasOmniroute(opts.settings)) {
    return overlayJudge(opts.intent, commandFallback());
  }

  const request = opts.request ?? requestChatRole;
  const result = await request({
    settings: opts.settings,
    role: "judge",
    system: JUDGE_PROMPT,
    payload: {
      transcript: opts.transcript,
      summary: opts.intent.summary,
      targetQueries: opts.intent.targetQueries,
      selectionCount: opts.scene.selection.length,
      hasCommand: Boolean(opts.intent.command),
      nodeCount: Object.keys(opts.scene.nodes).length,
      edgeCount: Object.keys(opts.scene.edges).length,
    },
    signal: opts.signal,
  });

  if (!result.ok) return overlayJudge(opts.intent, commandFallback());
  const parsed = parseJudge(result.content);
  if (!parsed) return overlayJudge(opts.intent, commandFallback());
  return overlayJudge(opts.intent, parsed);
}
