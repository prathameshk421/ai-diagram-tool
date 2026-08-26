import { describe, expect, it } from "vitest";
import {
  GROQ_WHISPER_MODEL,
  MAX_LIVE_GROQ_TRANSCRIPTIONS,
  refuseRateLimitRetry,
} from "../helpers/rateLimitGuard";
import { callDiagramApi, formRequestParts } from "../helpers/proxyHarness";
import { tinyWav } from "../helpers/tinyWav";
import { requireGroqKey } from "./keys";

const GROQ_MODELS = "https://api.groq.com/openai/v1/models";

describe("live Groq whisper-large-v3-turbo", () => {
  it(`sends at most ${MAX_LIVE_GROQ_TRANSCRIPTIONS} transcription after a models probe`, async () => {
    const key = requireGroqKey();

    const probe = await fetch(GROQ_MODELS, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(
      refuseRateLimitRetry(probe.status),
      refuseRateLimitRetry(probe.status) ?? `Groq models HTTP ${probe.status}`,
    ).toBeNull();
    expect(
      probe.status,
      probe.status === 401
        ? "GROQ_API_KEY was rejected (401). Use a real Groq key."
        : `Groq models HTTP ${probe.status}`,
    ).toBe(200);

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array(tinyWav())], "utterance.wav", { type: "audio/wav" }),
      "utterance.wav",
    );
    form.append("model", GROQ_WHISPER_MODEL);
    form.append("language", "en");
    form.append("temperature", "0");
    form.append("response_format", "verbose_json");
    const parts = await formRequestParts(form, {
      Authorization: `Bearer ${key}`,
    });

    const res = await callDiagramApi({
      method: "POST",
      url: "/api/transcribe",
      headers: parts.headers,
      body: parts.body,
    });

    const retryMsg = refuseRateLimitRetry(res.statusCode);
    expect(retryMsg, retryMsg ?? "").toBeNull();
    expect(res.statusCode).toBe(200);

    const remaining = res.headers["x-ratelimit-remaining-requests"];
    if (remaining) {
      expect(Number(remaining)).toBeGreaterThanOrEqual(0);
    }

    const parsed = JSON.parse(res.bodyText()) as {
      text?: unknown;
      no_speech_prob?: unknown;
    };
    expect(typeof parsed.text === "string" || parsed.text === undefined).toBe(
      true,
    );
  });
});
