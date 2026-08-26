import { describe, expect, it } from "vitest";
import { FLASH_MODEL } from "../../src/intent/types";
import { SYSTEM_PROMPT } from "../../src/intent/systemPrompt";
import {
  MAX_LIVE_OMNIROUTE_CHATS,
  omnirouteChatBlocked,
  refuseRateLimitRetry,
} from "../helpers/rateLimitGuard";
import { callDiagramApi } from "../helpers/proxyHarness";
import { requireOmnirouteKeys } from "./keys";

async function getJson(
  url: string,
  key: string,
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
  });
  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, headers: response.headers, body };
}

describe("live OmniRoute intent", () => {
  it(`probes /api/rate-limits then sends at most ${MAX_LIVE_OMNIROUTE_CHATS} chat`, async () => {
    const { key, url } = requireOmnirouteKeys();

    const models = await getJson(`${url}/v1/models`, key);
    expect(
      refuseRateLimitRetry(models.status),
      refuseRateLimitRetry(models.status) ?? "",
    ).toBeNull();

    const limits = await getJson(`${url}/api/rate-limits`, key);
    if (limits.status === 200) {
      const blocked = omnirouteChatBlocked(limits.body);
      expect(blocked, blocked ?? "").toBeNull();
    }

    const payload = {
      model: FLASH_MODEL,
      temperature: 0,
      stream: false,
      max_tokens: 80,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            transcript: "line these up on the left",
            selectionCount: 2,
          }),
        },
      ],
    };

    const res = await callDiagramApi({
      method: "POST",
      url: "/api/intent",
      headers: {
        authorization: `Bearer ${key}`,
        "x-omniroute-base": url,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    expect(
      refuseRateLimitRetry(res.statusCode),
      refuseRateLimitRetry(res.statusCode) ?? "",
    ).toBeNull();
    expect(res.statusCode).toBe(200);

    const parsed = JSON.parse(res.bodyText()) as {
      choices?: { message?: { content?: string } }[];
    };
    expect(parsed.choices?.[0]?.message?.content).toEqual(expect.any(String));
  });
});
