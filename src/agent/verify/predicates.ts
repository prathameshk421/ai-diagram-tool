import { isDeictic } from "../../scene/commandAdapter";
import { sceneHash } from "../../scene/hash";
import type { Scene } from "../../scene/types";
import { validateScene } from "../../scene/validate";
import type { EditToolCall } from "../edit";

export type VerifyFailure = { code: string; detail: string };

export type VerifyInput = {
  before: Scene;
  after: Scene;
  transcript: string;
  calls: EditToolCall[];
  expected?: {
    nodesAdded?: string[];
    noEdge?: { from: string; to: string }[];
    hasEdge?: { from: string; to: string }[];
  };
};

export type VerifyResult =
  | { pass: true }
  | { pass: false; failures: VerifyFailure[]; remediation: "rebuild" | "ask" | "abort" };

const COORDINATE_KEYS = new Set([
  "x",
  "y",
  "width",
  "height",
  "points",
  "cx",
  "cy",
]);

const ASK_CODES = new Set(["DEICTIC_WRITE", "STRICT_UNNAMED"]);

export function hasEdge(scene: Scene, from: string, to: string): boolean {
  return Object.values(scene.edges).some(
    (edge) => edge.from === from && edge.to === to,
  );
}

export function noEdge(scene: Scene, from: string, to: string): boolean {
  return !hasEdge(scene, from, to);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

function argsHaveCoordinates(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(argsHaveCoordinates);
  if (!isRecord(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "pin" || COORDINATE_KEYS.has(key)) return true;
    if (argsHaveCoordinates(child)) return true;
  }
  return false;
}

/** Skip kernel `pin` / ink `points`; fail stray x,y,width,height on agent-owned objects. */
function sceneHasAgentCoordinates(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(sceneHasAgentCoordinates);
  if (!isRecord(value)) return false;
  for (const [key, child] of Object.entries(value)) {
    if (key === "pin" || key === "points") continue;
    if (COORDINATE_KEYS.has(key)) return true;
    if (sceneHasAgentCoordinates(child)) return true;
  }
  return false;
}

function namedInTranscript(id: string, label: string, transcript: string): boolean {
  const blob = transcript.toLowerCase();
  if (blob.includes(id.toLowerCase())) return true;
  const name = label.toLowerCase();
  return Boolean(name) && blob.includes(name);
}

export function verifyEdit(input: VerifyInput): VerifyResult {
  const { before, after, transcript, calls, expected } = input;
  const failures: VerifyFailure[] = [];

  const invalid = validateScene(after);
  if (invalid.length) {
    failures.push({
      code: "INVALID_SCENE",
      detail: invalid[0].message,
    });
  }

  for (const call of calls) {
    if (call.tool !== "insert_on_path") continue;
    const edgeId = call.args.on;
    const nodeId = call.args.node;
    const original = before.edges[edgeId];
    if (!original) {
      failures.push({
        code: "INSERT_MISSING",
        detail: `unknown edge ${edgeId}`,
      });
      continue;
    }
    if (edgeId in after.edges || hasEdge(after, original.from, original.to)) {
      failures.push({
        code: "INSERT_SIDECAR",
        detail: `${original.from}→${original.to} still present`,
      });
    }
    if (
      !hasEdge(after, original.from, nodeId) ||
      !hasEdge(after, nodeId, original.to)
    ) {
      failures.push({
        code: "INSERT_MISSING",
        detail: `missing splice through ${nodeId} on ${edgeId}`,
      });
    }
  }

  if (calls.some((call) => call.tool === "beautify")) {
    const beforeIds = Object.keys(before.nodes).sort();
    const afterIds = Object.keys(after.nodes).sort();
    if (beforeIds.join("\0") !== afterIds.join("\0")) {
      failures.push({
        code: "BEAUTIFY_UNFROZEN",
        detail: "beautify changed node ids",
      });
    } else {
      for (const id of beforeIds) {
        const prev = before.nodes[id];
        const next = after.nodes[id];
        if (prev.kind !== next.kind) {
          failures.push({
            code: "BEAUTIFY_UNFROZEN",
            detail: `kind changed on ${id}`,
          });
        }
        if (JSON.stringify(prev.pin ?? null) !== JSON.stringify(next.pin ?? null)) {
          failures.push({
            code: "BEAUTIFY_UNFROZEN",
            detail: `pin changed on ${id}`,
          });
        }
      }
    }
  }

  if (calls.some((call) => argsHaveCoordinates(call.args)) || sceneHasAgentCoordinates(after)) {
    failures.push({
      code: "COORDINATE_LEAK",
      detail: "agent wrote coordinates",
    });
  }

  if (after.meta.strict) {
    for (const [id, node] of Object.entries(after.nodes)) {
      if (id in before.nodes) continue;
      if (!namedInTranscript(id, node.label, transcript)) {
        failures.push({
          code: "STRICT_UNNAMED",
          detail: `strict mode: unnamed node ${id}`,
        });
      }
    }
  }

  if (expected?.nodesAdded) {
    for (const id of expected.nodesAdded) {
      if (!(id in after.nodes) || id in before.nodes) {
        failures.push({
          code: "EXPECTED_NODE",
          detail: `expected added node ${id}`,
        });
      }
    }
  }
  if (expected?.hasEdge) {
    for (const pair of expected.hasEdge) {
      if (!hasEdge(after, pair.from, pair.to)) {
        failures.push({
          code: "EXPECTED_EDGE",
          detail: `expected ${pair.from}→${pair.to}`,
        });
      }
    }
  }
  if (expected?.noEdge) {
    for (const pair of expected.noEdge) {
      if (!noEdge(after, pair.from, pair.to)) {
        failures.push({
          code: "EXPECTED_NO_EDGE",
          detail: `expected no ${pair.from}→${pair.to}`,
        });
      }
    }
  }

  if (
    isDeictic(transcript) &&
    before.selection.length === 0 &&
    calls.some(toolNeedsTargets) &&
    sceneHash(after) !== sceneHash(before)
  ) {
    failures.push({
      code: "DEICTIC_WRITE",
      detail: "Select something on the board first.",
    });
  }

  if (!failures.length) return { pass: true };
  const remediation = failures.some((f) => !ASK_CODES.has(f.code))
    ? "rebuild"
    : "ask";
  return { pass: false, failures, remediation };
}
