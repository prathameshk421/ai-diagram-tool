import { applyEditPlan, desugarCommand } from "../agent/edit";
import { cloneJson } from "./clone";
import { compile } from "./kernel";
import { defaultNode } from "./empty";
import type { Command } from "../intent/types";
import type { Scene } from "./types";

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

export function applyCommand(scene: Scene, command: Command, transcript = ""): Scene {
  return applyEditPlan(scene, desugarCommand(command, scene), { transcript }).scene;
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
