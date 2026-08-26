import { afterEach, describe, expect, it, vi } from "vitest";
import { MISSING_OMNIROUTE_SAY, unknownCommand } from "../../src/intent/types";
import type { Settings } from "../../src/settings/store";
import { apiDbScene, twoKafkaScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: "test/model",
};

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

function httpError(status: number, body = "err") {
  return {
    ok: false,
    status,
    text: async () => body,
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

describe("bindReferents", () => {
  it("maps postgres to db on apiDbScene", async () => {
    const { bindReferents } = await import("../../src/agent/roles/bindReferents");
    const result = bindReferents(apiDbScene(), ["postgres"]);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.ids).toContain("db");
    }
  });

  it("asks with kafka ids when two Kafkas match", async () => {
    const { bindReferents } = await import("../../src/agent/roles/bindReferents");
    const result = bindReferents(twoKafkaScene(), ["kafka"]);
    expect(result.status).toBe("ask");
    if (result.status === "ask") {
      expect(result.candidates).toEqual(
        expect.arrayContaining(["kafka_a", "kafka_b"]),
      );
    }
  });
});

describe("parseEnhancer", () => {
  it("strips markdown fences and accepts a ready object", async () => {
    const { parseEnhancer } = await import("../../src/agent/roles/parseEnhancer");
    const parsed = parseEnhancer(
      '```json\n{"status":"ready","summary":"ok","targetQueries":[]}\n```',
    );
    expect(parsed).toEqual({
      status: "ready",
      summary: "ok",
      targetQueries: [],
    });
  });

  it("returns null for invalid JSON", async () => {
    const { parseEnhancer } = await import("../../src/agent/roles/parseEnhancer");
    expect(parseEnhancer("not json {{")).toBeNull();
  });
});

describe("runEnhancer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("binds postgres targetQueries to db after the LLM returns ready", async () => {
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({
        status: "ready",
        summary: "align postgres",
        targetQueries: ["postgres"],
      }),
    });
    const result = await runEnhancer({
      settings: keyed,
      transcript: "align postgres",
      scene: apiDbScene(),
      pending: null,
      followUpTo: null,
      request,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.ids).toContain("db");
      expect(result.targetQueries).toEqual(["postgres"]);
    }
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].role).toBe("enhancer");
  });

  it("asks and is not ready when two kafkas match targetQueries kafka", async () => {
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({
        status: "ready",
        summary: "align kafka",
        targetQueries: ["kafka"],
      }),
    });
    const result = await runEnhancer({
      settings: keyed,
      transcript: "align the kafka",
      scene: twoKafkaScene(),
      pending: null,
      followUpTo: null,
      request,
    });
    expect(result.status).toBe("ask");
    expect(result.status).not.toBe("ready");
    if (result.status === "ask") {
      expect(result.kind).toBe("selection");
      expect(result.candidates).toEqual(
        expect.arrayContaining(["kafka_a", "kafka_b"]),
      );
    }
  });

  it("refuses invalid JSON without throwing", async () => {
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: "definitely not json {{",
    });
    let threw = false;
    let result;
    try {
      result = await runEnhancer({
        settings: keyed,
        transcript: "align left",
        scene: apiDbScene(),
        pending: null,
        followUpTo: null,
        request,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result?.status).toBe("refuse");
    if (result?.status === "refuse") {
      expect(result.reason).toBe("llm");
      expect(result.say).toBe(unknownCommand().say);
    }
  });

  it("HTTP 500 refuses and fetches once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const result = await runEnhancer({
      settings: keyed,
      transcript: "align left",
      scene: apiDbScene(),
      pending: null,
      followUpTo: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("refuse");
    if (result.status === "refuse") {
      expect(result.reason).toBe("llm");
      expect(result.say).toBe(unknownCommand().say);
    }
  });

  it("empty API key refuses missing key and does not fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const result = await runEnhancer({
      settings: { ...keyed, omnirouteApiKey: "  " },
      transcript: "align left",
      scene: apiDbScene(),
      pending: null,
      followUpTo: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe("refuse");
    if (result.status === "refuse") {
      expect(result.say).toBe(MISSING_OMNIROUTE_SAY);
    }
  });

  it("payload scene has no pin keys", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okChat(
        JSON.stringify({
          status: "ready",
          summary: "align left",
          targetQueries: [],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const { ENHANCER_PROMPT } = await import(
      "../../src/agent/roles/enhancerPrompt"
    );
    await runEnhancer({
      settings: keyed,
      transcript: "align left",
      scene: apiDbScene(),
      pending: null,
      followUpTo: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(300);
    expect(body.thinking).toEqual({ type: "disabled" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].content).toBe(ENHANCER_PROMPT);
    expect(ENHANCER_PROMPT.toLowerCase()).toContain("json");
    expect(ENHANCER_PROMPT.toLowerCase()).toMatch(/pin|coordinate/);
    expect(ENHANCER_PROMPT).toMatch(/targetQueries/);
    const payload = JSON.parse(messages[1].content) as Record<string, unknown>;
    expect(payload.transcript).toBe("align left");
    expect(jsonHasPinKey(payload.scene)).toBe(false);
    expect(JSON.stringify(payload.scene)).not.toMatch(/"pin"/);
  });

  it("still binds referents when pending and followUpTo are set", async () => {
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const pending = {
      id: "ask-1",
      question: "Which Kafka?",
      kind: "selection" as const,
      candidates: ["kafka_a", "kafka_b"],
      originalTranscript: "align the kafka",
      sceneHashAtAsk: "abc",
    };
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({
        status: "ready",
        summary: "align kafka",
        targetQueries: ["kafka"],
      }),
    });
    const result = await runEnhancer({
      settings: keyed,
      transcript: "the left one",
      scene: twoKafkaScene(),
      pending,
      followUpTo: pending.id,
      request,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].payload.followUpTo).toBe(pending.id);
    expect(result.status).toBe("ask");
  });
});

describe("runEnhancer in the pipeline", () => {
  it("returns ask pending when bind cannot resolve kafka", async () => {
    const { runPipeline } = await import(
      "../../src/agent/pipeline/orchestrator"
    );
    const { runEnhancer } = await import("../../src/agent/roles/runEnhancer");
    const scene = twoKafkaScene();
    const request = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      content: JSON.stringify({
        status: "ready",
        summary: "align kafka",
        targetQueries: ["kafka"],
      }),
    });
    const result = await runPipeline(
      {
        transcript: "align the kafka",
        scene,
        settings: keyed,
        pending: null,
      },
      {
        enhance: (input) =>
          runEnhancer({ settings: keyed, ...input, request }),
        judge: async () => ({ route: "command", reason: "unused" }),
        requestCommand: async () => {
          throw new Error("requestCommand should not be called");
        },
      },
    );
    expect(result.wrote).toBe(false);
    expect(result.ask).toBe(true);
    expect(result.pending).not.toBeNull();
    expect(result.pending?.kind).toBe("selection");
  });
});
