import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, SETTINGS_KEY } from "../../src/settings/store";
import { FLASH_MODEL } from "../../src/intent/types";

describe("settings store", () => {
  it("defaults to empty keys and flash, not env", () => {
    expect(DEFAULT_SETTINGS.groqApiKey).toBe("");
    expect(DEFAULT_SETTINGS.omnirouteApiKey).toBe("");
    expect(DEFAULT_SETTINGS.omnirouteModel).toBe(FLASH_MODEL);
    expect(DEFAULT_SETTINGS.omnirouteUrl).toBe("http://localhost:20128");
    expect(SETTINGS_KEY).toBe("ai-diagram-tool:settings");
  });

  it("loadSettings returns defaults in Node (no localStorage / no env)", () => {
    process.env.GROQ_API_KEY = "must-not-be-used";
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    delete process.env.GROQ_API_KEY;
  });
});
