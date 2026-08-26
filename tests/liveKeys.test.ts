import { afterEach, describe, expect, it } from "vitest";
import { requireAllLiveKeys, requireGroqKey } from "./live/keys";

describe("live key requirements (no network)", () => {
  const originalGroq = process.env.GROQ_API_KEY;
  const originalOmni = process.env.OMNIROUTE_API_KEY;
  const originalUrl = process.env.OMNIROUTE_URL;

  afterEach(() => {
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroq;
    if (originalOmni === undefined) delete process.env.OMNIROUTE_API_KEY;
    else process.env.OMNIROUTE_API_KEY = originalOmni;
    if (originalUrl === undefined) delete process.env.OMNIROUTE_URL;
    else process.env.OMNIROUTE_URL = originalUrl;
  });

  it("rejects a missing or dummy Groq key", () => {
    process.env.GROQ_API_KEY = "";
    expect(() => requireGroqKey()).toThrow(/GROQ_API_KEY is required/);
    process.env.GROQ_API_KEY = "must-not-be-used";
    expect(() => requireGroqKey()).toThrow(/gsk_/);
  });

  it("requires both Groq and OmniRoute keys together", () => {
    process.env.GROQ_API_KEY = "gsk_test_not_sent";
    delete process.env.OMNIROUTE_API_KEY;
    expect(() => requireAllLiveKeys()).toThrow(/OMNIROUTE_API_KEY is required/);
  });
});
