import { describe, expect, it } from "vitest";
import { cloneJson } from "../../src/scene/clone";
import { defaultNode } from "../../src/scene/empty";
import { sceneHash } from "../../src/scene/hash";
import { SceneHistory } from "../../src/scene/history";
import { hostUndoKind } from "../../src/scene/host";
import { applyTurn } from "../../src/scene/turn";
import { serializeScene } from "../../src/scene/persist";
import { projectForAgent } from "../../src/scene/project";
import { apiDbScene, inkStrokeScene } from "./fixtures";
import type { Command } from "../../src/intent/types";

const align: Command = {
  op: "align",
  args: { edge: "left" },
  confidence: 0.9,
  say: "Aligned left.",
};

const perfect: Command = {
  op: "perfect",
  args: { shape: "auto" },
  confidence: 0.9,
  say: "Cleaned up.",
};

describe("empty-selection ask", () => {
  it("does not write when the prompt is deictic and selection is empty", () => {
    const scene = apiDbScene();
    scene.selection = [];
    const before = sceneHash(scene);
    const result = applyTurn(scene, { type: "command", command: perfect }, "perfect this");
    expect(result.ask).toBe(true);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say).toMatch(/select/i);
  });
});

describe("question turns", () => {
  it("leaves the file SHA unchanged", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = applyTurn(
      scene,
      { type: "command", command: align },
      "what is the single point of failure?",
    );
    expect(result.wrote).toBe(false);
    expect(result.answer).toBeTruthy();
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene).toBe(scene);
  });

  it("answers a missing-cache question without writing", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = applyTurn(
      scene,
      { type: "answer", say: "ignored" },
      "are we missing a cache?",
    );
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.answer).toMatch(/no cache/i);
  });
});

describe("strict extra node", () => {
  it("refuses a node that was not named in the utterance", () => {
    const scene = apiDbScene();
    scene.meta.strict = true;
    const before = sceneHash(scene);
    const result = applyTurn(
      scene,
      {
        type: "patch",
        say: "Added bonus.",
        ops: [
          {
            op: "add",
            path: "/nodes/surprise",
            value: defaultNode({ label: "Surprise", kind: "service" }),
          },
        ],
      },
      "make it nicer",
    );
    expect(result.wrote).toBe(false);
    expect(result.ask).toBe(true);
    expect(sceneHash(result.scene)).toBe(before);
  });

  it("allows a named insert under strict", () => {
    const scene = apiDbScene();
    scene.meta.strict = true;
    const result = applyTurn(
      scene,
      {
        type: "patch",
        say: "Added Redis.",
        ops: [
          {
            op: "add",
            path: "/nodes/redis",
            value: defaultNode({
              kind: "cache",
              label: "Redis",
              icon: "redis",
              shape: "cylinder",
            }),
          },
        ],
      },
      "add redis in front of the db",
    );
    expect(result.wrote).toBe(true);
    expect(result.scene.nodes.redis).toBeDefined();
  });
});

describe("stored file vs agent projection", () => {
  it("keeps ink.points on disk and omits them in the agent-facing copy", () => {
    const scene = inkStrokeScene();
    const raw = serializeScene(scene);
    expect(raw).toContain("points");
    const projected = projectForAgent(scene) as {
      ink: Record<string, { points?: unknown }>;
      view: unknown;
    };
    expect(projected.ink.stroke_1.points).toBeUndefined();
    expect(projected.view).toBeDefined();
    expect(scene.ink.stroke_1.points?.length).toBeGreaterThan(0);
  });
});

describe("host undo", () => {
  it("snapshots restore the previous scene; hunk undo matches a label", () => {
    const history = new SceneHistory();
    const before = apiDbScene();
    const after = cloneJson(before);
    after.nodes.kafka = defaultNode({
      kind: "queue",
      label: "Kafka",
      icon: "kafka",
    });
    history.record("added kafka topic", before, after);
    const undone = history.undo(after);
    expect(undone.nodes.kafka).toBeUndefined();
    history.record("added kafka topic", before, after);
    const hunk = history.undoHunk("kafka", after);
    expect(hunk.nodes.kafka).toBeUndefined();
  });

  it("classifies undo phrases as host, not model writes", () => {
    expect(hostUndoKind("undo")).toBe("full");
    expect(hostUndoKind("put it back")).toBe("full");
    expect(hostUndoKind("undo last kafka bit")).toEqual({ hunk: "kafka" });
    expect(hostUndoKind("align left")).toBeNull();
  });

  it("classifies Talk-path STT transcripts with the same hostUndoKind as type-in", () => {
    // Spoken "undo" / "put it back" must be host restore (App runText), not runPipeline unknown.
    expect(hostUndoKind("undo")).toBe("full");
    expect(hostUndoKind("Undo.")).toBe("full");
    expect(hostUndoKind(" put it back ")).toBe("full");
    expect(hostUndoKind("put that back")).toBe("full");
    expect(hostUndoKind("undo last kafka bit")).toEqual({ hunk: "kafka" });
    expect(hostUndoKind("undo last kafka")).toEqual({ hunk: "kafka" });
  });
});
