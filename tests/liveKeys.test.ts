import { afterEach, describe, expect, it } from "vitest";
import {
  liveOmnirouteModel,
  requireAllLiveKeys,
  requireGroqKey,
} from "./live/keys";

describe("live key requirements (no network)", () => {
  const originalGroq = process.env.GROQ_API_KEY;
  const originalOmni = process.env.OMNIROUTE_API_KEY;
  const originalUrl = process.env.OMNIROUTE_URL;
  const originalModel = process.env.OMNIROUTE_MODEL;

  afterEach(() => {
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroq;
    if (originalOmni === undefined) delete process.env.OMNIROUTE_API_KEY;
    else process.env.OMNIROUTE_API_KEY = originalOmni;
    if (originalUrl === undefined) delete process.env.OMNIROUTE_URL;
    else process.env.OMNIROUTE_URL = originalUrl;
    if (originalModel === undefined) delete process.env.OMNIROUTE_MODEL;
    else process.env.OMNIROUTE_MODEL = originalModel;
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

  it("requires OMNIROUTE_MODEL and trims it", () => {
    delete process.env.OMNIROUTE_MODEL;
    expect(() => liveOmnirouteModel()).toThrow(/OMNIROUTE_MODEL is required/);
    process.env.OMNIROUTE_MODEL = "  provider/model-id  ";
    expect(liveOmnirouteModel()).toBe("provider/model-id");
  });
});
