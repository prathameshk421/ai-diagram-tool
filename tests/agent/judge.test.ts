import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnhancerOutput } from "../../src/agent/pipeline/session";
import { type Command } from "../../src/intent/types";
import type { Settings } from "../../src/settings/store";
import { apiDbScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: "test/model",
};

const alignLeft: Command = {
  op: "align",
  args: { edge: "left" },
  confidence: 0.9,
  say: "Aligned left.",
};

const readyAlign: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "align left",
  targetQueries: [],
  command: alignLeft,
};

const readyStructural: Extract<EnhancerOutput, { status: "ready" }> = {
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

describe("parseJudge", () => {
  it("returns null for invalid JSON", async () => {
    const { parseJudge } = await import("../../src/agent/roles/parseJudge");
    expect(parseJudge("nope")).toBeNull();
    expect(parseJudge('{"route":"plan"}')).toBeNull();
    expect(parseJudge('{"route":"unknown","reason":"x"}')).toBeNull();
  });

  it("accepts command build and plan", async () => {
    const { parseJudge } = await import("../../src/agent/roles/parseJudge");
    expect(parseJudge('{"route":"command","reason":"layout"}')).toEqual({
      route: "command",
      reason: "layout",
    });
    expect(
      parseJudge('```json\n{"route":"build","reason":"insert"}\n```'),
    ).toEqual({ route: "build", reason: "insert" });
  });
});

describe("runJudge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("overlays route command when intent.command is align left even if the LLM says plan", async () => {
    const { runJudge } = await import("../../src/agent/roles/runJudge");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({ route: "plan", reason: "looks-big" }),
    });
    const result = await runJudge({
      settings: keyed,
      transcript: "align left",
      intent: readyAlign,
      scene: apiDbScene(),
      request,
    });
    expect(result.route).toBe("command");
    expect(result.route).not.toBe("plan");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].role).toBe("judge");
  });

  it("routes command not plan when the LLM returns invalid JSON", async () => {
    const { runJudge } = await import("../../src/agent/roles/runJudge");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: "{not-json",
    });
    const result = await runJudge({
      settings: keyed,
      transcript: "align left",
      intent: {
        status: "ready",
        summary: "align left",
        targetQueries: [],
      },
      scene: apiDbScene(),
      request,
    });
    expect(result.route).toBe("command");
    expect(result.route).not.toBe("plan");
    expect(result.reason).toBe("fallback");
  });

  it("forces build when hints.structural is true and multiStep is missing", async () => {
    const { runJudge } = await import("../../src/agent/roles/runJudge");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({ route: "plan", reason: "llm-plan" }),
    });
    const result = await runJudge({
      settings: keyed,
      transcript: "add redis in front of the db",
      intent: readyStructural,
      scene: apiDbScene(),
      request,
    });
    expect(result.route).toBe("build");
    expect(result.route).not.toBe("plan");
  });

  it("HTTP 500 falls back to command and fetches once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { runJudge } = await import("../../src/agent/roles/runJudge");
    const result = await runJudge({
      settings: keyed,
      transcript: "align left",
      intent: {
        status: "ready",
        summary: "align left",
        targetQueries: [],
      },
      scene: apiDbScene(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.route).toBe("command");
    expect(result.route).not.toBe("plan");
    expect(result.reason).toBe("fallback");
  });

  it("sends scene stats without pins", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okChat(JSON.stringify({ route: "build", reason: "ok" })));
    vi.stubGlobal("fetch", fetchMock);
    const { runJudge } = await import("../../src/agent/roles/runJudge");
    const { JUDGE_PROMPT } = await import("../../src/agent/roles/judgePrompt");
    const scene = apiDbScene();
    await runJudge({
      settings: keyed,
      transcript: "add redis",
      intent: readyStructural,
      scene,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(120);
    expect(body.thinking).toEqual({ type: "disabled" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].content).toBe(JUDGE_PROMPT);
    expect(JUDGE_PROMPT.toLowerCase()).toContain("command");
    expect(JUDGE_PROMPT.toLowerCase()).toContain("build");
    expect(JUDGE_PROMPT.toLowerCase()).toContain("plan");
    const payload = JSON.parse(messages[1].content) as Record<string, unknown>;
    expect(payload.transcript).toBe("add redis");
    expect(payload.summary).toBe(readyStructural.summary);
    expect(payload.targetQueries).toEqual(["db"]);
    expect(payload.hasCommand).toBe(false);
    expect(payload.selectionCount).toBe(scene.selection.length);
    expect(payload.nodeCount).toBe(Object.keys(scene.nodes).length);
    expect(payload.edgeCount).toBe(Object.keys(scene.edges).length);
    expect(payload.scene).toBeUndefined();
    expect(jsonHasPinKey(payload)).toBe(false);
  });
});
