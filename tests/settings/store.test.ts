import { describe, expect, it, vi } from "vitest";
import { envOmnirouteModel } from "../../src/intent/model";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_KEY,
} from "../../src/settings/store";

describe("settings store", () => {
  it("defaults to empty keys; model id comes from env, not a picker", () => {
    expect(DEFAULT_SETTINGS.groqApiKey).toBe("");
    expect(DEFAULT_SETTINGS.omnirouteApiKey).toBe("");
    expect(DEFAULT_SETTINGS.omnirouteModel).toBe("");
    expect(DEFAULT_SETTINGS.omnirouteUrl).toBe("http://localhost:20128");
    expect(SETTINGS_KEY).toBe("ai-diagram-tool:settings");
  });

  it("loadSettings uses OMNIROUTE_MODEL and ignores env API keys", () => {
    process.env.GROQ_API_KEY = "must-not-be-used";
    const loaded = loadSettings();
    expect(loaded.groqApiKey).toBe("");
    expect(loaded.omnirouteApiKey).toBe("");
    expect(loaded.omnirouteModel).toBe(envOmnirouteModel());
    delete process.env.GROQ_API_KEY;
  });

  it("ignores a stored omnirouteModel and uses OMNIROUTE_MODEL", () => {
    const previous = process.env.OMNIROUTE_MODEL;
    process.env.OMNIROUTE_MODEL = "provider/model-id";
    vi.stubGlobal("localStorage", {
      getItem: () =>
        JSON.stringify({
          omnirouteUrl: "http://localhost:20128",
          omnirouteApiKey: "sk_stored",
          groqApiKey: "gsk_stored",
          omnirouteModel: "stale/old",
        }),
      setItem: () => {},
    });
    const loaded = loadSettings();
    expect(loaded.omnirouteApiKey).toBe("sk_stored");
    expect(loaded.omnirouteModel).toBe("provider/model-id");
    vi.unstubAllGlobals();
    if (previous === undefined) delete process.env.OMNIROUTE_MODEL;
    else process.env.OMNIROUTE_MODEL = previous;
  });
});
