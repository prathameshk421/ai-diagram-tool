import { cloneJson } from "./clone";
import { isDeictic, needsSelection } from "./commandAdapter";
import { sceneHash } from "./hash";
import { isDuplicateBoardAsk, isColorQuery, isSplitAsk, isWholeBoardGen, COLOR_SAY, SPLIT_SAY, WHOLE_BOARD_SAY } from "./host";
import { compile } from "./kernel";
import { applyJsonPatch, AgentWriteError } from "./patch";
import { applyEditPlan, desugarCommand } from "../agent/edit";
import type { Command } from "../intent/types";
import type { JsonPatchOp, Scene, TurnResult } from "./types";

const QUESTION = /^(what|where|why|how|who|is\b|are\b|does\b|do\b|can you explain|explain)\b/i;

export function isQuestion(transcript: string): boolean {
  return QUESTION.test(transcript.trim());
}

export function explainScene(scene: Scene, transcript: string): string {
  const text = transcript.toLowerCase();
  const nodeCount = Object.keys(scene.nodes).length;
  const edgeCount = Object.keys(scene.edges).length;
  if (/single point of failure|spof/.test(text)) {
    const indeg = new Map<string, number>();
    for (const id of Object.keys(scene.nodes)) indeg.set(id, 0);
    for (const edge of Object.values(scene.edges)) {
      indeg.set(edge.to, (indeg.get(edge.to) ?? 0) + 1);
    }
    const hot = [...indeg.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!hot || hot[1] === 0) return "No obvious single point of failure from the edges.";
    return `${scene.nodes[hot[0]]?.label || hot[0]} has the most incoming edges (${hot[1]}).`;
  }
  if (/request actually go|where does a request/.test(text)) {
    const edges = Object.values(scene.edges).map(
      (e) => `${scene.nodes[e.from]?.label || e.from} → ${scene.nodes[e.to]?.label || e.to}`,
    );
    return edges.length ? `Paths: ${edges.join("; ")}.` : "No edges on the board.";
  }
  if (/missing a cache/.test(text)) {
    const hasCache = Object.values(scene.nodes).some((n) => n.kind === "cache" || n.icon === "redis");
    return hasCache ? "There is already a cache on the board." : "No cache node yet. Say so if you want Redis added.";
  }
  if (/3-tier|three-tier/.test(text)) {
    const kinds = new Set(Object.values(scene.nodes).map((n) => n.kind));
    const ok = kinds.has("actor") && kinds.has("service") && kinds.has("datastore");
    return ok
      ? "Looks like a client / service / store split."
      : "Not a full 3-tier: need an actor, a service, and a datastore.";
  }
  if (/pm|explain/.test(text)) {
    return `This diagram has ${nodeCount} boxes and ${edgeCount} connections.`;
  }
  return `This diagram has ${nodeCount} boxes and ${edgeCount} connections.`;
}

export type AgentTurn =
  | { type: "command"; command: Command }
  | { type: "patch"; ops: JsonPatchOp[]; say: string }
  | { type: "answer"; say: string }
  | { type: "ask"; say: string };

export function applyTurn(
  scene: Scene,
  turn: AgentTurn,
  transcript: string,
): TurnResult {
  const beforeHash = sceneHash(scene);
  if (isWholeBoardGen(transcript)) {
    return {
      scene,
      say: WHOLE_BOARD_SAY,
      wrote: false,
      ask: false,
      answer: WHOLE_BOARD_SAY,
    };
  }
  if (isDuplicateBoardAsk(transcript)) {
    const say =
      "v1 keeps one id namespace; a second diagram beside this one is out of scope.";
    return { scene, say, wrote: false, ask: false, answer: say };
  }
  if (isColorQuery(transcript)) {
    return {
      scene,
      say: COLOR_SAY,
      wrote: false,
      ask: true,
      answer: null,
    };
  }
  if (isSplitAsk(transcript)) {
    return {
      scene,
      say: SPLIT_SAY,
      wrote: false,
      ask: true,
      answer: null,
    };
  }
  if (isQuestion(transcript)) {
    const say = explainScene(scene, transcript);
    return {
      scene,
      say,
      wrote: false,
      ask: false,
      answer: say,
    };
  }
  if (turn.type === "answer") {
    return {
      scene,
      say: turn.say,
      wrote: false,
      ask: false,
      answer: turn.say,
    };
  }
  if (turn.type === "ask") {
    return { scene, say: turn.say, wrote: false, ask: true, answer: null };
  }
  if (
    turn.type === "command" &&
    needsSelection(turn.command) &&
    isDeictic(transcript) &&
    scene.selection.length === 0
  ) {
    return {
      scene,
      say: "Select something on the board first.",
      wrote: false,
      ask: true,
      answer: null,
    };
  }
  if (scene.meta.strict && turn.type === "command" && turn.command.op === "unknown") {
    return { scene, say: turn.command.say, wrote: false, ask: false, answer: null };
  }
  try {
    let next: Scene;
    let say: string;
    if (turn.type === "patch") {
      next = compile(applyJsonPatch(cloneJson(scene), turn.ops));
      say = turn.say;
    } else {
      if (turn.command.op === "unknown") {
        return {
          scene,
          say: turn.command.say,
          wrote: false,
          ask: false,
          answer: null,
        };
      }
      const edited = applyEditPlan(
        scene,
        desugarCommand(turn.command, scene),
        { transcript },
      );
      if (edited.ask) {
        return {
          scene: edited.scene,
          say: edited.say,
          wrote: false,
          ask: true,
          answer: null,
        };
      }
      if (!edited.ok) {
        return {
          scene,
          say: edited.say,
          wrote: false,
          ask: false,
          answer: null,
        };
      }
      next = edited.scene;
      say = turn.command.say;
    }
    if (next.meta.strict) {
      const added = Object.keys(next.nodes).filter((id) => !(id in scene.nodes));
      const blob = transcript.toLowerCase();
      for (const id of added) {
        if (id in scene.ink) continue;
        const label = next.nodes[id].label.toLowerCase();
        if (!blob.includes(id) && !(label && blob.includes(label))) {
          return {
            scene,
            say: "Strict mode: that would add a node you didn't name.",
            wrote: false,
            ask: true,
            answer: null,
          };
        }
      }
    }
    return {
      scene: next,
      say,
      wrote: sceneHash(next) !== beforeHash,
      ask: false,
      answer: null,
    };
  } catch (error) {
    const message = error instanceof AgentWriteError ? error.message : "Could not apply that edit.";
    return { scene, say: message, wrote: false, ask: false, answer: null };
  }
}
