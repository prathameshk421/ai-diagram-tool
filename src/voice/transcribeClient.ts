import { filenameForMime } from "./recorder";

const STT_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRY_AFTER_CAP_MS = 2000;
/** Empty text or this no-speech floor skips the LLM. */
export const NO_SPEECH_SKIP = 0.6;
const GROQ_PROMPT =
  "perfect this, align left, snap to grid, distribute, rotate, connect these";

export type TranscribeOk = {
  ok: true;
  text: string;
  noSpeechProb: number;
};

export type TranscribeErr = {
  ok: false;
  error: "missing_key" | "http" | "timeout";
};

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
    }
  }
  return Math.min(250 * 2 ** attempt, RETRY_AFTER_CAP_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maxNoSpeechProb(parsed: Record<string, unknown>): number {
  if (typeof parsed.no_speech_prob === "number") return parsed.no_speech_prob;
  const segments = parsed.segments;
  if (!Array.isArray(segments)) return 0;
  let max = 0;
  for (const segment of segments) {
    if (
      typeof segment === "object" &&
      segment !== null &&
      typeof (segment as { no_speech_prob?: unknown }).no_speech_prob ===
        "number"
    ) {
      max = Math.max(
        max,
        (segment as { no_speech_prob: number }).no_speech_prob,
      );
    }
  }
  return max;
}

/** After STT: skip intent when Groq heard nothing or is unsure it is speech. */
export function shouldSkipIntentFromStt(
  text: string,
  noSpeechProb: number,
): boolean {
  return !text || noSpeechProb >= NO_SPEECH_SKIP;
}

export async function transcribeAudio(
  blob: Blob,
  groqApiKey: string,
  mime: string,
): Promise<TranscribeOk | TranscribeErr> {
  if (!groqApiKey.trim()) return { ok: false, error: "missing_key" };

  const filename = filenameForMime(mime);
  const buildForm = (): FormData => {
    const file = new File([blob], filename, { type: blob.type || mime });
    const body = new FormData();
    body.append("file", file, filename);
    body.append("model", "whisper-large-v3-turbo");
    body.append("language", "en");
    body.append("temperature", "0");
    body.append("response_format", "verbose_json");
    body.append("prompt", GROQ_PROMPT);
    return body;
  };

  let lastError: TranscribeErr = { ok: false, error: "http" };
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqApiKey}` },
        body: buildForm(),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = { ok: false, error: "http" };
        if (attempt < MAX_RETRIES) {
          await sleep(retryDelayMs(response, attempt));
          continue;
        }
        return lastError;
      }
      if (!response.ok) return { ok: false, error: "http" };
      const parsed: unknown = await response.json();
      if (typeof parsed !== "object" || parsed === null) {
        return { ok: false, error: "http" };
      }
      const record = parsed as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      return {
        ok: true,
        text,
        noSpeechProb: maxNoSpeechProb(record),
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      lastError = { ok: false, error: aborted ? "timeout" : "http" };
      if (aborted || attempt >= MAX_RETRIES) return lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  return lastError;
}
