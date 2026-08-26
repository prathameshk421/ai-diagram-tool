import { describe, expect, it } from "vitest";
import {
  GROQ_WHISPER_MODEL,
  GROQ_WHISPER_RPM,
  GROQ_WHISPER_RPD,
  MAX_LIVE_GROQ_TRANSCRIPTIONS,
  MAX_LIVE_OMNIROUTE_CHATS,
  groqAllowsTranscription,
  omnirouteChatBlocked,
  refuseRateLimitRetry,
} from "./helpers/rateLimitGuard";

describe("live rate-limit budget (from Groq + OmniRoute docs)", () => {
  it("caps whisper well under the free-plan 20 RPM / 2K RPD", () => {
    expect(GROQ_WHISPER_MODEL).toBe("whisper-large-v3-turbo");
    expect(GROQ_WHISPER_RPM).toBe(20);
    expect(GROQ_WHISPER_RPD).toBe(2000);
    expect(MAX_LIVE_GROQ_TRANSCRIPTIONS).toBe(1);
    expect(MAX_LIVE_GROQ_TRANSCRIPTIONS).toBeLessThan(GROQ_WHISPER_RPM);
    expect(MAX_LIVE_OMNIROUTE_CHATS).toBe(1);
  });

  it("blocks Groq transcription on 429 and on RPD remaining 0", () => {
    expect(
      groqAllowsTranscription(429, new Headers({ "retry-after": "2" })),
    ).toMatchObject({ ok: false });
    expect(
      groqAllowsTranscription(
        200,
        new Headers({ "x-ratelimit-remaining-requests": "0" }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      groqAllowsTranscription(
        200,
        new Headers({ "x-ratelimit-remaining-requests": "1999" }),
      ),
    ).toEqual({ ok: true });
  });

  it("blocks OmniRoute chat on cooldown, lockout, or a deep queue", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(
      omnirouteChatBlocked({
        connections: [{ rateLimitedUntil: future, provider: "opencode" }],
      }),
    ).toMatch(/cooling down/);
    expect(
      omnirouteChatBlocked({
        lockouts: [{ model: "provider/model-id", remainingMs: 5000 }],
      }),
    ).toMatch(/lockout/);
    expect(
      omnirouteChatBlocked(
        {
          lockouts: [
            { model: "provider/model-id", remainingMs: 5000 },
          ],
        },
        Date.now(),
        "provider/model-id",
      ),
    ).toMatch(/lockout/);
    expect(omnirouteChatBlocked({ connections: [{ queued: 12 }] })).toMatch(
      /queue/,
    );
    expect(omnirouteChatBlocked({ connections: [{ queued: 0 }] })).toBeNull();
  });

  it("never retries 429 in live tests", () => {
    expect(refuseRateLimitRetry(429)).toMatch(/refuse to retry/);
    expect(refuseRateLimitRetry(200)).toBeNull();
  });
});
