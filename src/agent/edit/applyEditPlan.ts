import { cloneJson } from "../../scene/clone";
import { isDeictic } from "../../scene/commandAdapter";
import { sceneHash } from "../../scene/hash";
import { AgentWriteError } from "../../scene/patch";
import type { Scene } from "../../scene/types";
import { EMPTY_DIFF, semanticDiff } from "./diff";
import { applyTool } from "./tools";
import type { EditPlanContext, EditResult, EditToolCall } from "./types";

const DEFAULT_MAX_CALLS = 8;
const SELECT_SAY = "Select something on the board first.";

function toolNeedsTargets(call: EditToolCall): boolean {
  switch (call.tool) {
    case "align":
    case "distribute":
    case "equalize":
    case "snap":
    case "bump_size":
    case "rotate":
      return !call.args.nodes?.length;
    case "beautify":
      return call.args.scope === "selection";
    case "convert_ink":
      return !call.args.ids?.length;
    case "add_edge":
      return !call.args.from?.trim() || !call.args.to?.trim();
    default:
      return false;
  }
}

function failResult(
  scene: Scene,
  beforeHash: string,
  say: string,
  errors: EditResult["errors"],
): EditResult {
  return {
    scene,
    say,
    wrote: false,
    ask: false,
    answer: null,
    ok: false,
    beforeHash,
    afterHash: beforeHash,
    diff: EMPTY_DIFF,
    errors,
  };
}

function askResult(scene: Scene, beforeHash: string, say: string): EditResult {
  return {
    scene,
    say,
    wrote: false,
    ask: true,
    answer: null,
    ok: true,
    beforeHash,
    afterHash: beforeHash,
    diff: EMPTY_DIFF,
    errors: [],
  };
}

export function applyEditPlan(
  scene: Scene,
  calls: EditToolCall[],
  ctx: EditPlanContext,
): EditResult {
  const beforeHash = sceneHash(scene);
  const maxCalls = ctx.maxCalls ?? DEFAULT_MAX_CALLS;
  if (calls.length > maxCalls) {
    return failResult(scene, beforeHash, `At most ${maxCalls} edits per turn.`, [
      { code: "MAX_CALLS", message: `at most ${maxCalls} edit calls` },
    ]);
  }

  let working = cloneJson(scene);
  try {
    for (const call of calls) {
      if (
        isDeictic(ctx.transcript) &&
        working.selection.length === 0 &&
        toolNeedsTargets(call)
      ) {
        return askResult(scene, beforeHash, SELECT_SAY);
      }
      const step = applyTool(working, call, ctx);
      if (step.status === "ask") {
        return askResult(scene, beforeHash, step.say);
      }
      if (step.status === "error") {
        return failResult(scene, beforeHash, step.say, step.errors);
      }
      working = step.scene;
    }
  } catch (error) {
    const message =
      error instanceof AgentWriteError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not apply that edit.";
    return failResult(scene, beforeHash, message, [
      { code: "APPLY", message },
    ]);
  }

  const afterHash = sceneHash(working);
  return {
    scene: working,
    say: "OK",
    wrote: afterHash !== beforeHash,
    ask: false,
    answer: null,
    ok: true,
    beforeHash,
    afterHash,
    diff: semanticDiff(scene, working),
    errors: [],
  };
}
