import { loadEnv } from "vite";
import { requireAllLiveKeys } from "./keys";

// Vite only puts VITE_* on import.meta.env. Live tests need the unprefixed
// keys from `.env` on process.env (GROQ_*, OMNIROUTE_*).
const fromFile = loadEnv("live", process.cwd(), "");
for (const [key, value] of Object.entries(fromFile)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Fail the whole live suite before any Groq/OmniRoute call when keys are missing.
requireAllLiveKeys();
