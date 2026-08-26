import { describe, expect, it } from "vitest";
import {
  applyEditPlan,
  desugarCommand,
  type EditToolCall,
} from "../../src/agent/edit";
import { applyCommand } from "../../src/scene/commandAdapter";
import { sceneHash } from "../../src/scene/hash";
import { compile } from "../../src/scene/kernel";
import { AgentWriteError, applyJsonPatch } from "../../src/scene/patch";
import { applyTurn } from "../../src/scene/turn";
import type { Command } from "../../src/intent/types";
import { apiDbScene, twoKafkaScene } from "../scene/fixtures";

describe("applyEditPlan transactional rollback", () => {
  it("rolls back the whole plan when a later call is invalid", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [
        {
          tool: "add_node",
          args: {
            id: "redis",
            spec: { label: "Redis", kind: "cache", icon: "redis" },
          },
        },
        {
          tool: "set_node",
          args: { target: "api", patch: { label: "Gateway" } },
        },
        {
          tool: "set_node",
          args: { target: "missing_target", patch: { label: "Nope" } },
        },
      ],
      { transcript: "add redis" },
    );
    expect(result.ok).toBe(false);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene.nodes.redis).toBeUndefined();
    expect(result.scene.nodes.api.label).toBe("API");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("host field immutability", () => {
  it("rejects JSON Patch writes to /selection and /lastDrawn", () => {
    const scene = apiDbScene();
    expect(() =>
      applyJsonPatch(scene, [{ op: "replace", path: "/selection", value: ["api"] }]),
    ).toThrow(AgentWriteError);
    expect(() =>
      applyJsonPatch(scene, [{ op: "replace", path: "/lastDrawn", value: "api" }]),
    ).toThrow(AgentWriteError);
  });

  it("rejects replace/remove of whole /nodes or /edges and RFC6902 '-'", () => {
    const scene = apiDbScene();
    expect(() =>
      applyJsonPatch(scene, [{ op: "replace", path: "/nodes", value: {} }]),
    ).toThrow(AgentWriteError);
    expect(() =>
      applyJsonPatch(scene, [{ op: "remove", path: "/edges" }]),
    ).toThrow(AgentWriteError);
    expect(() =>
      applyJsonPatch(scene, [{ op: "add", path: "/constraints/-", value: { op: "snap" } }]),
    ).toThrow(AgentWriteError);
  });
});

describe("insert splice", () => {
  it("splices api→db into api→redis→db and drops the original edge", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [
        {
          tool: "add_node",
          args: {
            id: "redis",
            spec: {
              kind: "cache",
              label: "Redis",
              icon: "redis",
              shape: "cylinder",
            },
          },
        },
        { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
      ],
      { transcript: "add redis in front of the db" },
    );
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    expect(sceneHash(result.scene)).not.toBe(before);
    expect(result.scene.edges.api_to_db).toBeUndefined();
    const hops = Object.values(result.scene.edges);
    expect(hops.some((e) => e.from === "api" && e.to === "db")).toBe(false);
    expect(hops.some((e) => e.from === "api" && e.to === "redis")).toBe(true);
    expect(hops.some((e) => e.from === "redis" && e.to === "db")).toBe(true);
    expect(result.diff.nodesAdded).toContain("redis");
    expect(result.diff.edgesRemoved).toContain("api_to_db");
  });
});

describe("referent tie → ask", () => {
  it("asks and does not write when kafka is ambiguous", () => {
    const scene = twoKafkaScene();
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [{ tool: "set_node", args: { target: "kafka", patch: { label: "Bus" } } }],
      { transcript: "rename kafka" },
    );
    expect(result.ask).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene.nodes.kafka_a.label).toBe("Kafka");
  });
});

describe("deictic empty selection", () => {
  it("asks when align these has nothing selected", () => {
    const scene = apiDbScene();
    scene.selection = [];
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [{ tool: "align", args: { edge: "left" } }],
      { transcript: "align these" },
    );
    expect(result.ask).toBe(true);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say).toMatch(/select/i);
  });
});

describe("strict mode", () => {
  it("asks when an unnamed node would be added", () => {
    const scene = apiDbScene();
    scene.meta.strict = true;
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [
        {
          tool: "add_node",
          args: { spec: { label: "Surprise", kind: "service" } },
        },
      ],
      { transcript: "make it nicer" },
    );
    expect(result.ask).toBe(true);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say).toMatch(/strict mode: that would add a node you didn't name/i);
    expect(Object.keys(result.scene.nodes)).toEqual(["api", "db"]);
  });

  it("allows a named redis insert under strict and splices", () => {
    const scene = apiDbScene();
    scene.meta.strict = true;
    const result = applyEditPlan(
      scene,
      [
        {
          tool: "add_node",
          args: {
            id: "redis",
            spec: {
              kind: "cache",
              label: "Redis",
              icon: "redis",
              shape: "cylinder",
            },
          },
        },
        { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
      ],
      { transcript: "add redis in front of the db" },
    );
    expect(result.wrote).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.scene.nodes.redis).toBeDefined();
    expect(result.scene.edges.api_to_db).toBeUndefined();
    const hops = Object.values(result.scene.edges);
    expect(hops.some((e) => e.from === "api" && e.to === "redis")).toBe(true);
    expect(hops.some((e) => e.from === "redis" && e.to === "db")).toBe(true);
  });
});

describe("max calls", () => {
  it("rejects more than 8 calls without writing", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const calls: EditToolCall[] = Array.from({ length: 9 }, () => ({
      tool: "set_node" as const,
      args: { target: "api", patch: { label: "API" } },
    }));
    const result = applyEditPlan(scene, calls, { transcript: "rename api" });
    expect(result.ok).toBe(false);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.errors.some((e) => e.code === "MAX_CALLS")).toBe(true);
  });
});

describe("silent kernel no-op becomes error", () => {
  it("fails insert_on_path when the edge is missing", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = applyEditPlan(
      scene,
      [{ tool: "insert_on_path", args: { node: "redis", on: "missing_edge" } }],
      { transcript: "add redis" },
    );
    expect(result.ok).toBe(false);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene.nodes.redis).toBeUndefined();
  });

  it("throws from compile when an insert pass names a missing edge", () => {
    const scene = apiDbScene();
    scene.passes = [{ type: "insert", node: "redis", on: "missing_edge" }];
    expect(() => compile(scene)).toThrow(/unknown edge/i);
  });
});

describe("command desugar", () => {
  it("maps perfect to convert_ink then beautify", () => {
    const command: Command = {
      op: "perfect",
      args: { shape: "auto" },
      confidence: 0.9,
      say: "Cleaned up.",
    };
    const calls = desugarCommand(command);
    expect(calls.map((c) => c.tool)).toEqual(["convert_ink", "beautify"]);
    expect(calls[1]).toEqual({
      tool: "beautify",
      args: { scope: "selection" },
    });
  });

  it("applyCommand and applyTurn still write align left on two selected nodes", () => {
    const scene = apiDbScene();
    scene.selection = ["api", "db"];
    const command: Command = {
      op: "align",
      args: { edge: "left" },
      confidence: 0.9,
      say: "Aligned left.",
    };
    const next = applyCommand(scene, command);
    expect(next.nodes.api.pin!.x).toBe(next.nodes.db.pin!.x);

    const result = applyTurn(
      scene,
      { type: "command", command },
      "align left",
    );
    expect(result.wrote).toBe(true);
    expect(result.ask).toBe(false);
    expect(result.scene.nodes.api.pin!.x).toBe(result.scene.nodes.db.pin!.x);
  });
});

describe("forbidden geometry in set_node", () => {
  it("rejects a pin or x sneak and does not write", () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const pinResult = applyEditPlan(
      scene,
      [
        {
          tool: "set_node",
          args: {
            target: "api",
            patch: { pin: { x: 1, y: 2 } } as never,
          },
        },
      ],
      { transcript: "move api" },
    );
    expect(pinResult.ok).toBe(false);
    expect(pinResult.wrote).toBe(false);
    expect(sceneHash(pinResult.scene)).toBe(before);

    const xResult = applyEditPlan(
      scene,
      [
        {
          tool: "set_node",
          args: { target: "api", patch: { x: 9 } as never },
        },
      ],
      { transcript: "move api" },
    );
    expect(xResult.ok).toBe(false);
    expect(xResult.wrote).toBe(false);
    expect(sceneHash(xResult.scene)).toBe(before);
    expect(scene.nodes.api.pin).toEqual({ x: 80, y: 120 });
  });
});

describe("unpin", () => {
  it("deletes pin without setting x/y on the node", () => {
    const scene = apiDbScene();
    expect(scene.nodes.api.pin).toEqual({ x: 80, y: 120 });
    const result = applyEditPlan(
      scene,
      [{ tool: "unpin", args: { target: "api" } }],
      { transcript: "unpin api" },
    );
    expect(result.ok).toBe(true);
    expect(result.wrote).toBe(true);
    const node = result.scene.nodes.api as { x?: number; y?: number };
    expect(node.x).toBeUndefined();
    expect(node.y).toBeUndefined();
    expect("x" in result.scene.nodes.api).toBe(false);
    expect("y" in result.scene.nodes.api).toBe(false);
  });
});
