import { afterEach, describe, expect, it, vi } from "vitest";
import { FLASH_MODEL, type Command } from "../../src/intent/types";
import { SYSTEM_PROMPT } from "../../src/intent/systemPrompt";
import type { Settings } from "../../src/settings/store";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

function llmCommand(overrides: Partial<Command> = {}): Command {
  return {
    op: "align",
    args: { edge: "left" },
    confidence: 0.7,
    say: "Aligned left.",
    ...overrides,
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

function httpError(status: number, body = "err") {
  return {
    ok: false,
    status,
    text: async () => body,
  };
}

describe("requestChatRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enhancer role sends max_tokens 300 not 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('{"ask":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    await requestChatRole({
      settings: keyed,
      role: "enhancer",
      system: "enhancer-system",
      payload: { utterance: "what is this", scene: { nodes: {} } },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/intent");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test",
    );
    expect((init.headers as Record<string, string>)["X-OmniRoute-Base"]).toBe(
      "http://localhost:20128",
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(300);
    expect(body.max_tokens).not.toBe(200);
    expect(body.temperature).toBe(0);
    expect(body.stream).toBe(false);
    expect(body.response_format).toBeUndefined();
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({
      role: "system",
      content: "enhancer-system",
    });
    expect(messages[1].role).toBe("user");
    expect(JSON.parse(messages[1].content)).toEqual({
      utterance: "what is this",
      scene: { nodes: {} },
    });
  });

  it("includes thinking: { type: disabled }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat("raw-content"));
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    const result = await requestChatRole({
      settings: keyed,
      role: "judge",
      system: "judge-system",
      payload: { n: 1 },
    });
    expect(result).toEqual({ ok: true, content: "raw-content", status: 200 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(body)).not.toMatch(/"thinking":false/);
  });

  it("HTTP 500 is called once and returns ok: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(500, "boom"));
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    const result = await requestChatRole({
      settings: keyed,
      role: "plan",
      system: "plan-system",
      payload: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("http");
      expect(result.status).toBe(500);
    }
  });

  it("HTTP 429 is called once and returns ok: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(httpError(429, "slow"));
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    const result = await requestChatRole({
      settings: keyed,
      role: "review",
      system: "review-system",
      payload: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("http");
      expect(result.status).toBe(429);
    }
  });

  it("HTTP 400 retries once without thinking", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(httpError(400, "bad thinking"))
      .mockResolvedValueOnce(okChat("retried-ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    const result = await requestChatRole({
      settings: keyed,
      role: "build",
      system: "build-system",
      payload: { step: 1 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    const second = JSON.parse(
      String(fetchMock.mock.calls[1][1].body),
    ) as Record<string, unknown>;
    expect(first.thinking).toEqual({ type: "disabled" });
    expect(second.thinking).toBeUndefined();
    expect(first.max_tokens).toBe(600);
    expect(JSON.stringify(second)).not.toMatch(/"thinking":false/);
    expect(result).toEqual({ ok: true, content: "retried-ok", status: 200 });
  });

  it("aborted extra signal returns error abort", async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const err = Object.assign(new Error("Aborted"), { name: "AbortError" });
        if (init.signal?.aborted) {
          reject(err);
          return;
        }
        init.signal?.addEventListener("abort", () => reject(err));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestChatRole } = await import("../../src/intent/omnirouteClient");
    const controller = new AbortController();
    controller.abort();
    const result = await requestChatRole({
      settings: keyed,
      role: "command",
      system: "sys",
      payload: { transcript: "hi" },
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("abort");
  });
});

describe("requestIntent via requestChatRole", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("still sends max_tokens 200 and payload without scene", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okChat(JSON.stringify(llmCommand({ confidence: 0.8 }))));
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    await requestIntent(keyed, "clean this up", 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.max_tokens).toBe(200);
    expect(body.thinking).toEqual({ type: "disabled" });
    const messages = body.messages as { role: string; content: string }[];
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    const payload = JSON.parse(messages[1].content) as Record<string, unknown>;
    expect(payload).toEqual({
      transcript: "clean this up",
      selectionCount: 1,
      selection: [],
    });
    expect(payload.scene).toBeUndefined();
    expect("scene" in payload).toBe(false);
  });
});
