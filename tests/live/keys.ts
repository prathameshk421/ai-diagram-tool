function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    throw new Error(
      `${name} is required for live API tests. Set it in the environment (test runner only; the Vite proxy still does not read API keys from process.env).`,
    );
  }
  return value;
}

export function requireGroqKey(): string {
  const value = required("GROQ_API_KEY");
  if (!value.startsWith("gsk_")) {
    throw new Error(
      "GROQ_API_KEY must be a Groq secret key (starts with gsk_). Dummy or env-placeholder values are not accepted.",
    );
  }
  return value;
}

export function liveOmnirouteModel(): string {
  return required("OMNIROUTE_MODEL");
}

export function requireOmnirouteKeys(): {
  key: string;
  url: string;
  model: string;
} {
  return {
    key: required("OMNIROUTE_API_KEY"),
    url: (process.env.OMNIROUTE_URL?.trim() || "http://localhost:20128").replace(
      /\/+$/,
      "",
    ),
    model: liveOmnirouteModel(),
  };
}

export function requireAllLiveKeys(): {
  groq: string;
  omnirouteKey: string;
  omnirouteUrl: string;
  omnirouteModel: string;
} {
  const groq = requireGroqKey();
  const omni = requireOmnirouteKeys();
  return {
    groq,
    omnirouteKey: omni.key,
    omnirouteUrl: omni.url,
    omnirouteModel: omni.model,
  };
}
