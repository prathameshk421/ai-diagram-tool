import { cloneJson } from "./clone";
import { compile } from "./kernel";
import { bumpSize } from "./passes";
import { defaultNode } from "./empty";
import { nextId } from "./ids";
import type { Command } from "../intent/types";
import type { PerfectShape } from "../intent/types";
import type { AlignEdge, DistributeAxis, EqualizeDim, Scene } from "./types";

const DEICTIC = /\b(this|these|the selected|selected)\b/i;

export function needsSelection(command: Command): boolean {
  return (
    command.op === "align" ||
    command.op === "distribute" ||
    command.op === "equalize" ||
    command.op === "connect" ||
    command.op === "perfect" ||
    command.op === "bigger" ||
    command.op === "smaller" ||
    command.op === "snap" ||
    command.op === "rotate"
  );
}

export function isDeictic(transcript: string): boolean {
  return DEICTIC.test(transcript);
}

export function applyCommand(scene: Scene, command: Command): Scene {
  const next = cloneJson(scene);
  switch (command.op) {
    case "align":
      next.constraints.push({
        op: "align",
        edge: command.args.edge as AlignEdge,
      });
      break;
    case "distribute":
      next.constraints.push({
        op: "distribute",
        axis: command.args.axis as DistributeAxis,
      });
      break;
    case "equalize":
      next.constraints.push({
        op: "equalize",
        dim: (command.args.dim as EqualizeDim) ?? "both",
      });
      break;
    case "snap":
      next.constraints.push({ op: "snap" });
      break;
    case "bigger":
    case "smaller": {
      const dir = command.op === "bigger" ? 1 : -1;
      for (const id of next.selection) {
        if (next.nodes[id]) next.nodes[id].size = bumpSize(next.nodes[id].size, dir);
      }
      break;
    }
    case "rotate":
      for (const id of next.selection) {
        if (next.nodes[id]) {
          next.nodes[id].rotation = next.nodes[id].rotation === 90 ? 0 : 90;
        }
      }
      break;
    case "connect": {
      const nodes = next.selection.filter((id) => id in next.nodes);
      if (nodes.length >= 2) {
        const id = nextId(next, "e_");
        next.edges[id] = {
          from: nodes[0],
          to: nodes[1],
          label: "",
          kind: "sync",
          stroke: "solid",
          route: "ortho",
          exposure: null,
        };
      }
      break;
    }
    case "perfect": {
      const shape = (command.args.shape as PerfectShape | undefined) ?? "auto";
      for (const id of next.selection) {
        if (next.ink[id]) {
          next.ink[id].convert =
            shape === "auto"
              ? "auto"
              : shape === "line"
                ? "line"
                : shape === "ellipse"
                  ? "ellipse"
                  : shape === "diamond"
                    ? "diamond"
                    : "rectangle";
        }
        if (next.nodes[id] && shape !== "auto" && shape !== "line") {
          next.nodes[id].shape =
            shape === "ellipse"
              ? "ellipse"
              : shape === "diamond"
                ? "diamond"
                : "rectangle";
          next.nodes[id].style = "clean";
        }
      }
      next.passes.push({ type: "convert-ink" });
      next.passes.push({ type: "beautify", scope: "selection" });
      break;
    }
    case "unknown":
      return next;
    default:
      break;
  }
  return compile(next);
}

export function applyInsertRedisInFront(scene: Scene, dbId: string): Scene {
  const next = cloneJson(scene);
  const edgeId = Object.entries(next.edges).find(([, e]) => e.to === dbId)?.[0];
  if (!edgeId) return next;
  next.nodes.redis = defaultNode({
    kind: "cache",
    label: "Redis",
    icon: "redis",
    shape: "cylinder",
    style: "clean",
  });
  next.passes.push({ type: "insert", node: "redis", on: edgeId });
  return compile(next);
}
