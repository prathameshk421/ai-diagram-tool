import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { diagramApi } from "../../server/proxy";

function makeReq(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const stream = Readable.from([opts.body ?? ""]);
  Object.assign(stream, {
    method: opts.method ?? "GET",
    url: opts.url,
    headers: opts.headers ?? {},
  });
  return stream as unknown as IncomingMessage;
}

function makeRes(): ServerResponse & {
  bodyText: () => string;
} {
  const chunks: string[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      }
    },
    bodyText: () => chunks.join(""),
  };
  return res as unknown as ServerResponse & { bodyText: () => string };
}

describe("proxy auth (no live APIs)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.OMNIROUTE_API_KEY;
  });

  it("does not mention process.env in proxy source", () => {
    const src = readFileSync(new URL("../../server/proxy.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/process\.env/);
  });

  it("GET /api/transcribe without Authorization is 401 even if GROQ_API_KEY is set", async () => {
    process.env.GROQ_API_KEY = "must-not-be-used";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await diagramApi(
      makeReq({ method: "GET", url: "/api/transcribe" }),
      res,
      () => {
        throw new Error("should not fall through");
      },
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.bodyText())).toEqual({ error: "missing_groq_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST /api/transcribe without Authorization is 401 even if env has a key", async () => {
    process.env.GROQ_API_KEY = "must-not-be-used";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await diagramApi(
      makeReq({ method: "POST", url: "/api/transcribe", body: "ignored" }),
      res,
      () => {
        throw new Error("should not fall through");
      },
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.bodyText())).toEqual({ error: "missing_groq_key" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("GET /api/transcribe with a bearer is 405 and does not fetch Groq", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await diagramApi(
      makeReq({
        method: "GET",
        url: "/api/transcribe",
        headers: { authorization: "Bearer gsk_test" },
      }),
      res,
      () => {
        throw new Error("should not fall through");
      },
    );
    expect(res.statusCode).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POST /api/intent without Authorization is 401 even if OMNIROUTE_API_KEY is set", async () => {
    process.env.OMNIROUTE_API_KEY = "must-not-be-used";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = makeRes();
    await diagramApi(
      makeReq({
        method: "POST",
        url: "/api/intent",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      res,
      () => {
        throw new Error("should not fall through");
      },
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.bodyText())).toEqual({
      error: "missing_omniroute_key",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards intent to {base}/v1/chat/completions and strips trailing slash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ choices: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      model: "opencode-go/deepseek-v4-flash",
      thinking: { type: "disabled" },
    };
    const res = makeRes();
    await diagramApi(
      makeReq({
        method: "POST",
        url: "/api/intent",
        headers: {
          authorization: "Bearer sk_test",
          "x-omniroute-base": "http://localhost:20128/",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      }),
      res,
      () => {
        throw new Error("should not fall through");
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk_test",
    );
    const forwarded = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(forwarded.thinking).toEqual({ type: "disabled" });
    expect(forwarded.response_format).toBeUndefined();
    expect(JSON.stringify(forwarded)).not.toMatch(/"thinking":false/);
  });
});
