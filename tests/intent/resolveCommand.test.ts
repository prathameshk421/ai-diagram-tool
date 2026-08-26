import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCommand } from "../../src/intent/resolveCommand";
import { FLASH_MODEL, PRO_MODEL, type Command } from "../../src/intent/types";
import { SYSTEM_PROMPT } from "../../src/intent/systemPrompt";
import type { Settings } from "../../src/settings/store";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

const emptyKeys: Settings = {
  ...keyed,
  omnirouteApiKey: "",
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

describe("resolveCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always calls OmniRoute on a known phrase when the key is set", async () => {
    const request = vi.fn().mockResolvedValue(llmCommand());
    const command = await resolveCommand("align left", 2, keyed, request);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(keyed, "align left", 2);
    expect(command.op).toBe("align");
  });

  it("always calls OmniRoute on bare align when the key is set", async () => {
    const request = vi.fn().mockResolvedValue(
      llmCommand({ op: "unknown", args: {}, confidence: 0, say: "Didn’t catch that." }),
    );
    await resolveCommand("align these", 2, keyed, request);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("always calls OmniRoute on a paraphrase when the key is set", async () => {
    const request = vi.fn().mockResolvedValue(llmCommand());
    const command = await resolveCommand(
      "line these up on the left",
      2,
      keyed,
      request,
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(keyed, "line these up on the left", 2);
    expect(command.op).toBe("align");
  });

  it("does not call OmniRoute when the URL is whitespace", async () => {
    const request = vi.fn();
    const command = await resolveCommand("line these up on the left", 2, {
      ...keyed,
      omnirouteUrl: "   ",
    }, request);
    expect(command.op).toBe("unknown");
    expect(command.say).toMatch(/OmniRoute API key/);
    expect(request).not.toHaveBeenCalled();
  });

  it("does not call OmniRoute when the key is empty", async () => {
    const request = vi.fn();
    const command = await resolveCommand("align left", 2, emptyKeys, request);
    expect(command.op).toBe("unknown");
    expect(command.say).toMatch(/OmniRoute API key/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("requestIntent payload", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends thinking disabled, omits response_format, default flash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(llmCommand({ confidence: 0.8 })),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    await requestIntent(keyed, "clean this up", 1);

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
    expect(body.model).toBe("opencode-go/deepseek-v4-flash");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(body)).not.toMatch(/"thinking":false/);
    expect(body.response_format).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(200);
    expect(body.stream).toBe(false);
    const messages = body.messages as { role: string; content: string }[];
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("json");
    expect(messages[1].content).toBe(
      JSON.stringify({ transcript: "clean this up", selectionCount: 1 }),
    );
  });

  it("Pro override changes model only; thinking stays disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify(llmCommand({ confidence: 0.8 })),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    await requestIntent(
      { ...keyed, omnirouteModel: PRO_MODEL },
      "clean this up",
      1,
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.model).toBe("opencode-go/deepseek-v4-pro");
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(JSON.stringify(body)).not.toMatch(/"thinking":false/);
  });

  it("HTTP 400 retries once with thinking omitted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "bad thinking",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify(llmCommand({ confidence: 0.8 })),
                },
              },
            ],
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    const command = await requestIntent(keyed, "clean this up", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(
      String(fetchMock.mock.calls[0][1].body),
    ) as Record<string, unknown>;
    const second = JSON.parse(
      String(fetchMock.mock.calls[1][1].body),
    ) as Record<string, unknown>;
    expect(first.thinking).toEqual({ type: "disabled" });
    expect(second.thinking).toBeUndefined();
    expect(command.op).toBe("align");
  });

  it("rejects coordinate-like keys and low confidence", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  op: "align",
                  args: { edge: "left", x: 12 },
                  confidence: 0.9,
                  say: "nope",
                }),
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    const withCoords = await requestIntent(keyed, "nudge left", 1);
    expect(withCoords.op).toBe("unknown");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  op: "align",
                  args: { edge: "left" },
                  confidence: 0.2,
                  say: "maybe",
                }),
              },
            },
          ],
        }),
    });
    const low = await requestIntent(keyed, "nudge left", 1);
    expect(low.op).toBe("unknown");
  });

  it("strips json fences", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "```json\n" +
                  JSON.stringify(llmCommand({ confidence: 0.8 })) +
                  "\n```",
              },
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    const command = await requestIntent(keyed, "clean this up", 1);
    expect(command.op).toBe("align");
  });

  it("HTTP 400 then 400 still only retries once", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "still bad",
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    const command = await requestIntent(keyed, "clean this up", 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(command.op).toBe("unknown");
  });

  it("does not retry intent 500", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "nope",
    });
    vi.stubGlobal("fetch", fetchMock);
    const { requestIntent } = await import("../../src/intent/omnirouteClient");
    const command = await requestIntent(keyed, "clean this up", 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<
      string,
      unknown
    >;
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(command.op).toBe("unknown");
  });
});
