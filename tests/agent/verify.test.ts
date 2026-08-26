import { describe, expect, it } from "vitest";
import { applyEditPlan, type EditToolCall } from "../../src/agent/edit";
import {
  hasEdge,
  noEdge,
  verifyEdit,
} from "../../src/agent/verify/predicates";
import { cloneJson } from "../../src/scene/clone";
import { defaultNode } from "../../src/scene/empty";
import { apiDbScene } from "../scene/fixtures";

const REDIS_INSERT: EditToolCall[] = [
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
];

describe("hasEdge / noEdge", () => {
  it("asserts expected edges on apiDbScene", () => {
    const scene = apiDbScene();
    expect(hasEdge(scene, "api", "db")).toBe(true);
    expect(noEdge(scene, "db", "api")).toBe(true);
    expect(noEdge(scene, "api", "missing")).toBe(true);
  });
});

describe("verifyEdit insert_on_path", () => {
  it("passes when redis is spliced onto api_to_db", () => {
    const before = apiDbScene();
    const edited = applyEditPlan(before, REDIS_INSERT, {
      transcript: "add Redis in front of the DB",
    });
    expect(edited.ok).toBe(true);
    const result = verifyEdit({
      before,
      after: edited.scene,
      transcript: "add Redis in front of the DB",
      calls: REDIS_INSERT,
      expected: {
        nodesAdded: ["redis"],
        hasEdge: [
          { from: "api", to: "redis" },
          { from: "redis", to: "db" },
        ],
        noEdge: [{ from: "api", to: "db" }],
      },
    });
    expect(result.pass).toBe(true);
    expect(hasEdge(edited.scene, "api", "redis")).toBe(true);
    expect(hasEdge(edited.scene, "redis", "db")).toBe(true);
    expect(noEdge(edited.scene, "api", "db")).toBe(true);
  });

  it("fails INSERT_SIDECAR when api→db remains", () => {
    const before = apiDbScene();
    const after = cloneJson(before);
    after.nodes.redis = defaultNode({
      kind: "cache",
      label: "Redis",
      icon: "redis",
      shape: "cylinder",
    });
    after.edges.api_to_redis = {
      from: "api",
      to: "redis",
      label: "reads",
      kind: "sync",
      stroke: "solid",
      route: "straight",
      exposure: null,
    };
    after.edges.redis_to_db = {
      from: "redis",
      to: "db",
      label: "",
      kind: "sync",
      stroke: "solid",
      route: "straight",
      exposure: null,
    };
    const result = verifyEdit({
      before,
      after,
      transcript: "add Redis in front of the DB",
      calls: [{ tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } }],
    });
    expect(result.pass).toBe(false);
    if (result.pass) return;
    expect(result.failures.some((f) => f.code === "INSERT_SIDECAR")).toBe(true);
    expect(result.remediation).toBe("rebuild");
  });
});

describe("verifyEdit beautify freeze", () => {
  it("fails BEAUTIFY_UNFROZEN when a kind changes", () => {
    const before = apiDbScene();
    const after = cloneJson(before);
    after.nodes.api.kind = "gateway";
    const result = verifyEdit({
      before,
      after,
      transcript: "beautify this",
      calls: [{ tool: "beautify", args: { scope: "board" } }],
    });
    expect(result.pass).toBe(false);
    if (result.pass) return;
    expect(result.failures.some((f) => f.code === "BEAUTIFY_UNFROZEN")).toBe(
      true,
    );
    expect(result.remediation).toBe("rebuild");
  });
});
