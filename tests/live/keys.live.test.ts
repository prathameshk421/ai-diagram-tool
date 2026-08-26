import { describe, expect, it } from "vitest";
import { requireAllLiveKeys } from "./keys";

describe("live keys", () => {
  it("requires GROQ_API_KEY and OMNIROUTE_API_KEY", () => {
    const keys = requireAllLiveKeys();
    expect(keys.groq.length).toBeGreaterThan(0);
    expect(keys.omnirouteKey.length).toBeGreaterThan(0);
    expect(keys.omnirouteUrl).toMatch(/^https?:\/\//);
    expect(keys.omnirouteModel.length).toBeGreaterThan(0);
  });
});
