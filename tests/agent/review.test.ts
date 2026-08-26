import { describe, expect, it } from "vitest";
import type { EditToolCall } from "../../src/agent/edit";
import type { AgentPlan } from "../../src/agent/roles/parsePlan";
import { apiDbScene } from "../scene/fixtures";

const redisSteps: EditToolCall[] = [
  {
    tool: "add_node",
    args: {
      id: "redis",
      spec: { kind: "cache", label: "Redis", icon: "redis", shape: "cylinder" },
    },
  },
  { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
];

const redisPlan: AgentPlan = {
  goal: "insert redis in front of the db",
  steps: redisSteps,
  expected: {
    nodesAdded: ["redis"],
    hasEdge: [
      { from: "api", to: "redis" },
      { from: "redis", to: "db" },
    ],
    noEdge: [{ from: "api", to: "db" }],
  },
  say: "Inserted Redis.",
};

describe("reviewPlan", () => {
  it("rejects PLAN_TOO_LONG for 13 steps", async () => {
    const { reviewPlan } = await import("../../src/agent/roles/reviewPlan");
    const steps: EditToolCall[] = Array.from({ length: 13 }, () => ({
      tool: "unpin",
      args: { target: "api" },
    }));
    const verdict = reviewPlan(
      {
        goal: "too many",
        steps,
        say: "unpin everything",
      },
      { transcript: "unpin the api", scene: apiDbScene() },
    );
    expect(verdict.verdict).toBe("reject");
    if (verdict.verdict !== "reject") return;
    expect(verdict.reasons.some((r) => r.code === "PLAN_TOO_LONG")).toBe(true);
  });

  it("rejects STRICT_UNNAMED when strict and add_node is unnamed", async () => {
    const { reviewPlan } = await import("../../src/agent/roles/reviewPlan");
    const scene = apiDbScene();
    scene.meta.strict = true;
    const verdict = reviewPlan(
      {
        goal: "add a surprise box",
        steps: [
          {
            tool: "add_node",
            args: { id: "mystery", spec: { label: "MysteryBox" } },
          },
        ],
        say: "Added a box.",
      },
      { transcript: "make it nicer", scene },
    );
    expect(verdict.verdict).toBe("reject");
    if (verdict.verdict !== "reject") return;
    expect(verdict.reasons.some((r) => r.code === "STRICT_UNNAMED")).toBe(true);
  });

  it("approves a redis insert plan", async () => {
    const { reviewPlan } = await import("../../src/agent/roles/reviewPlan");
    const verdict = reviewPlan(redisPlan, {
      transcript: "add Redis in front of the DB",
      scene: apiDbScene(),
    });
    expect(verdict).toEqual({
      verdict: "approve",
      notes: expect.any(String),
    });
  });

  it("rejects SIDECAR_INSERT when add_edge keeps A→B plus insert_on_path", async () => {
    const { reviewPlan } = await import("../../src/agent/roles/reviewPlan");
    const verdict = reviewPlan(
      {
        goal: "insert redis",
        steps: [
          { tool: "add_edge", args: { from: "api", to: "db" } },
          { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
        ],
        say: "Inserted Redis.",
      },
      { transcript: "add Redis in front of the DB", scene: apiDbScene() },
    );
    expect(verdict.verdict).toBe("reject");
    if (verdict.verdict !== "reject") return;
    expect(verdict.reasons.some((r) => r.code === "SIDECAR_INSERT")).toBe(true);
  });
});
