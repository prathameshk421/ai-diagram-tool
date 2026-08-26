import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnhancerOutput } from "../../src/agent/pipeline/session";
import { FLASH_MODEL, unknownCommand } from "../../src/intent/types";
import type { Settings } from "../../src/settings/store";
import { apiDbScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

const emptyKeys: Settings = {
  omnirouteUrl: "",
  omnirouteApiKey: "",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

const readyInsert: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "insert redis in front of the db",
  targetQueries: ["db"],
  hints: { structural: true, multiStep: true },
};

const redisPlanJson = {
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
};

function httpError(status: number, body = "err") {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

function okChat(content: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content } }],
      }),
  };
}

function jsonHasPinKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(jsonHasPinKey);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key === "pin" || jsonHasPinKey(nested),
    );
  }
  return false;
}

describe("parsePlan", () => {
  it("rejects pin in a step", async () => {
    const { parsePlan } = await import("../../src/agent/roles/parsePlan");
    expect(
      parsePlan(
        JSON.stringify({
          goal: "place redis",
          steps: [
            {
              tool: "add_node",
              args: {
                id: "redis",
                spec: { label: "Redis", pin: { x: 10, y: 20 } },
              },
            },
          ],
          say: "Added Redis.",
        }),
      ),
    ).toBeNull();
  });

  it("accepts two-step add_node + insert_on_path", async () => {
    const { parsePlan } = await import("../../src/agent/roles/parsePlan");
    const parsed = parsePlan(JSON.stringify(redisPlanJson));
    expect(parsed).toEqual(redisPlanJson);
  });
});

describe("runPlan", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("empty OmniRoute keys fail closed without fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runPlan } = await import("../../src/agent/roles/runPlan");
    const result = await runPlan({
      settings: emptyKeys,
      transcript: "add Redis in front of the DB",
      intent: readyInsert,
      scene: apiDbScene(),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("HTTP 500 returns null and fetches once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { runPlan } = await import("../../src/agent/roles/runPlan");
    const result = await runPlan({
      settings: keyed,
      transcript: "add Redis in front of the DB",
      intent: readyInsert,
      scene: apiDbScene(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
    expect(unknownCommand().say).toBeTruthy();
  });

  it("payload scene has no pin keys and forwards rejectReasons", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okChat(JSON.stringify(redisPlanJson)));
    vi.stubGlobal("fetch", fetchMock);
    const { runPlan } = await import("../../src/agent/roles/runPlan");
    const { PLAN_PROMPT } = await import("../../src/agent/roles/planPrompt");
    const rejectReasons = [
      { code: "SIDECAR_INSERT", detail: "add_edge would keep api→db" },
    ];
    const result = await runPlan({
      settings: keyed,
      transcript: "add Redis in front of the DB",
      intent: readyInsert,
      scene: apiDbScene(),
      rejectReasons,
    });
    expect(result).toEqual(redisPlanJson);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(800);
    expect(body.thinking).toEqual({ type: "disabled" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].content).toBe(PLAN_PROMPT);
    expect(PLAN_PROMPT).toMatch(/insert_on_path/);
    expect(PLAN_PROMPT).toMatch(/12/);
    expect(PLAN_PROMPT.toLowerCase()).toMatch(/pin|coordinate/);
    expect(PLAN_PROMPT).toMatch(/expected/i);
    const payload = JSON.parse(messages[1].content) as Record<string, unknown>;
    expect(payload.transcript).toBe("add Redis in front of the DB");
    expect(payload.intent).toEqual(readyInsert);
    expect(payload.rejectReasons).toEqual(rejectReasons);
    expect(jsonHasPinKey(payload.scene)).toBe(false);
    expect(JSON.stringify(payload.scene)).not.toMatch(/"pin"/);
  });
});
