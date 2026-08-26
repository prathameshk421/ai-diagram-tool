import { envOmnirouteModel } from "../intent/model";

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
  omnirouteModel: "",
};

function withEnvModel(settings: Settings): Settings {
  return { ...settings, omnirouteModel: envOmnirouteModel() };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return withEnvModel({ ...DEFAULT_SETTINGS });
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return withEnvModel({ ...DEFAULT_SETTINGS });
    }
    const rec = parsed as Record<string, unknown>;
    return withEnvModel({
      omnirouteUrl:
        typeof rec.omnirouteUrl === "string"
          ? rec.omnirouteUrl
          : DEFAULT_SETTINGS.omnirouteUrl,
      omnirouteApiKey:
        typeof rec.omnirouteApiKey === "string" ? rec.omnirouteApiKey : "",
      groqApiKey: typeof rec.groqApiKey === "string" ? rec.groqApiKey : "",
      omnirouteModel: "",
    });
  } catch {
    return withEnvModel({ ...DEFAULT_SETTINGS });
  }
}

export function saveSettings(settings: Settings): Settings {
  const next = withEnvModel(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}
