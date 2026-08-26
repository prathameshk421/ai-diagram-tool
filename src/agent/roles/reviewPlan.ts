import type { Scene } from "../../scene/types";
import type { EditToolCall } from "../edit";
import { hasGeometry } from "./parseBuild";
import type { AgentPlan } from "./parsePlan";

export type ReviewVerdict =
  | { verdict: "approve"; notes: string }
  | {
      verdict: "reject";
      reasons: { code: string; detail: string }[];
      fixHint: string;
    };

function namedInTranscript(
  id: string,
  label: string,
  transcript: string,
): boolean {
  const blob = transcript.toLowerCase();
  if (id && blob.includes(id.toLowerCase())) return true;
  const name = label.toLowerCase();
  return Boolean(name) && blob.includes(name);
}

function beautifyUnfrozen(call: EditToolCall): boolean {
  if (call.tool !== "beautify") return false;
  const args = call.args as Record<string, unknown>;
  return args.freezePins === false;
}

function sidecarInsert(
  plan: AgentPlan,
  scene: Scene,
): { from: string; to: string } | null {
  const addEdges = plan.steps.filter(
    (step): step is Extract<EditToolCall, { tool: "add_edge" }> =>
      step.tool === "add_edge",
  );
  for (const step of plan.steps) {
    if (step.tool !== "insert_on_path") continue;
    const edge = scene.edges[step.args.on];
    if (!edge) continue;
    const dup = addEdges.find(
      (add) => add.args.from === edge.from && add.args.to === edge.to,
    );
    if (dup) return { from: edge.from, to: edge.to };
  }
  return null;
}

export function reviewPlan(
  plan: AgentPlan,
  ctx: { transcript: string; scene: Scene },
): ReviewVerdict {
  const reasons: { code: string; detail: string }[] = [];

  if (plan.steps.length === 0) {
    reasons.push({ code: "EMPTY_STEPS", detail: "plan has no steps" });
  }
  if (plan.steps.length > 12) {
    reasons.push({
      code: "PLAN_TOO_LONG",
      detail: `plan has ${plan.steps.length} steps; max 12`,
    });
  }

  for (const step of plan.steps) {
    if (hasGeometry(step.args)) {
      reasons.push({
        code: "COORDINATE_LEAK",
        detail: `step ${step.tool} has coordinate keys`,
      });
    }
    if (beautifyUnfrozen(step)) {
      reasons.push({
        code: "BEAUTIFY_UNFROZEN",
        detail: "beautify must not set freezePins: false",
      });
    }
    if (ctx.scene.meta.strict && step.tool === "add_node") {
      const id = step.args.id ?? "";
      const label = step.args.spec.label ?? "";
      if (!namedInTranscript(id, label, ctx.transcript)) {
        reasons.push({
          code: "STRICT_UNNAMED",
          detail: `strict mode: unnamed node ${id || label}`,
        });
      }
    }
  }

  const sidecar = sidecarInsert(plan, ctx.scene);
  if (sidecar) {
    reasons.push({
      code: "SIDECAR_INSERT",
      detail: `add_edge would keep ${sidecar.from}→${sidecar.to} beside insert_on_path`,
    });
  }

  if (reasons.length) {
    return {
      verdict: "reject",
      reasons,
      fixHint: reasons.map((r) => r.code).join(", "),
    };
  }
  return { verdict: "approve", notes: "deterministic review passed" };
}
