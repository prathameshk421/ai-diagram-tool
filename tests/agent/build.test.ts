import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnhancerOutput } from "../../src/agent/pipeline/session";
import { unknownCommand } from "../../src/intent/types";
import type { Settings } from "../../src/settings/store";
import { apiDbScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: "test/model",
};

const readyInsert: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "insert redis in front of the db",
  targetQueries: ["db"],
  hints: { structural: true },
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

describe("parseBuild", () => {
  it("rejects pin in add_node spec", async () => {
    const { parseBuild } = await import("../../src/agent/roles/parseBuild");
    expect(
      parseBuild(
        JSON.stringify({
          calls: [
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

  it("accepts an insert_on_path list", async () => {
    const { parseBuild } = await import("../../src/agent/roles/parseBuild");
    const parsed = parseBuild(
      JSON.stringify({
        calls: [
          {
            tool: "add_node",
            args: { id: "redis", spec: { label: "Redis", kind: "cache" } },
          },
          { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
        ],
        say: "Inserted Redis.",
      }),
    );
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
  });

  it("returns null for unknown tools and more than 8 calls", async () => {
    const { parseBuild } = await import("../../src/agent/roles/parseBuild");
    expect(
      parseBuild(
        JSON.stringify({
          calls: [{ tool: "explode", args: {} }],
          say: "boom",
        }),
      ),
    ).toBeNull();
    const tooMany = Array.from({ length: 9 }, () => ({
      tool: "unpin",
      args: { target: "api" },
    }));
    expect(parseBuild(JSON.stringify({ calls: tooMany, say: "too many" }))).toBeNull();
  });
});

describe("runBuild", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("HTTP 500 returns empty calls and fetches once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { runBuild } = await import("../../src/agent/roles/runBuild");
    const result = await runBuild({
      settings: keyed,
      transcript: "add Redis in front of the DB",
      intent: readyInsert,
      scene: apiDbScene(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.calls).toEqual([]);
    expect(result.say).toBe(unknownCommand().say);
  });

  it("payload scene has no pin keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okChat(
        JSON.stringify({
          calls: [
            { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
          ],
          say: "Inserted Redis.",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { runBuild } = await import("../../src/agent/roles/runBuild");
    const { BUILD_PROMPT } = await import("../../src/agent/roles/buildPrompt");
    const errors = [{ code: "INSERT_SIDECAR", detail: "api still to db" }];
    await runBuild({
      settings: keyed,
      transcript: "add Redis in front of the DB",
      intent: readyInsert,
      scene: apiDbScene(),
      errors,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(600);
    expect(body.thinking).toEqual({ type: "disabled" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].content).toBe(BUILD_PROMPT);
    expect(BUILD_PROMPT).toMatch(/insert_on_path/);
    expect(BUILD_PROMPT.toLowerCase()).toMatch(/pin|coordinate/);
    expect(BUILD_PROMPT).toMatch(/\{calls,\s*say\}|\{"calls".*"say"/);
    const payload = JSON.parse(messages[1].content) as Record<string, unknown>;
    expect(payload.transcript).toBe("add Redis in front of the DB");
    expect(payload.intent).toEqual(readyInsert);
    expect(payload.errors).toEqual(errors);
    expect(jsonHasPinKey(payload.scene)).toBe(false);
    expect(JSON.stringify(payload.scene)).not.toMatch(/"pin"/);
  });
});
