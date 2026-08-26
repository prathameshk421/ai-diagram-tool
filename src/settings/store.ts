import { FLASH_MODEL } from "../intent/types";

export type Settings = {
  omnirouteUrl: string;
  omnirouteApiKey: string;
  groqApiKey: string;
  omnirouteModel: string;
};

export const SETTINGS_KEY = "ai-diagram-tool:settings";

export const DEFAULT_SETTINGS: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }
    const rec = parsed as Record<string, unknown>;
    return {
      omnirouteUrl:
        typeof rec.omnirouteUrl === "string"
          ? rec.omnirouteUrl
          : DEFAULT_SETTINGS.omnirouteUrl,
      omnirouteApiKey:
        typeof rec.omnirouteApiKey === "string" ? rec.omnirouteApiKey : "",
      groqApiKey: typeof rec.groqApiKey === "string" ? rec.groqApiKey : "",
      omnirouteModel:
        typeof rec.omnirouteModel === "string"
          ? rec.omnirouteModel
          : DEFAULT_SETTINGS.omnirouteModel,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
