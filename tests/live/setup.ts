import { requireAllLiveKeys } from "./keys";

// Fail the whole live suite before any Groq/OmniRoute call when keys are missing.
requireAllLiveKeys();
