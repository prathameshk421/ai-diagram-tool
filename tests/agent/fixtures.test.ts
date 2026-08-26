import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBuild } from "../../src/agent/roles/parseBuild";
import { parseEnhancer } from "../../src/agent/roles/parseEnhancer";
import { parsePlan } from "../../src/agent/roles/parsePlan";

function loadFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("agent pipeline fixtures", () => {
  it("JSON.parses enhancer-ready-align as a ready Command fast path", () => {
    const raw = loadFixture("enhancer-ready-align.json");
    const parsed = JSON.parse(raw) as unknown;
    expect(parsed).toEqual({
      status: "ready",
      summary: "align left",
      targetQueries: [],
      command: {
        op: "align",
        args: { edge: "left" },
        confidence: 0.9,
        say: "Aligned left.",
      },
    });
    expect(parseEnhancer(raw)).toEqual(parsed);
  });

  it("JSON.parses enhancer-ask-kafka as a ClarifyPanel ask", () => {
    const raw = loadFixture("enhancer-ask-kafka.json");
    const parsed = JSON.parse(raw) as unknown;
    expect(parsed).toEqual({
      status: "ask",
      kind: "selection",
      say: "Which Kafka?",
      candidates: ["kafka_a", "kafka_b"],
    });
    expect(parseEnhancer(raw)).toEqual(parsed);
  });

  it("JSON.parses build-insert-redis as insert_on_path tools", () => {
    const raw = loadFixture("build-insert-redis.json");
    const parsed = JSON.parse(raw) as unknown;
    expect(parsed).toEqual({
      calls: [
        {
          tool: "add_node",
          args: { id: "redis", spec: { label: "Redis", kind: "cache" } },
        },
        { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
      ],
      say: "Inserted Redis.",
    });
    expect(parseBuild(raw)).toEqual(parsed);
  });

  it("JSON.parses plan-insert-redis as a splice plan with expected predicates", () => {
    const raw = loadFixture("plan-insert-redis.json");
    const parsed = JSON.parse(raw) as unknown;
    expect(parsed).toEqual({
      goal: "insert redis in front of the db",
      steps: [
        {
          tool: "add_node",
          args: { id: "redis", spec: { label: "Redis", kind: "cache" } },
        },
        { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
      ],
      expected: {
        nodesAdded: ["redis"],
        hasEdge: [
          { from: "api", to: "redis" },
          { from: "redis", to: "db" },
        ],
        noEdge: [{ from: "api", to: "db" }],
      },
      say: "Inserted Redis.",
    });
    expect(parsePlan(raw)).toEqual(parsed);
  });
});
