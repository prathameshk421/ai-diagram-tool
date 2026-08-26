/**
 * Rate-limit policy from Groq and OmniRoute docs. Live tests import this so
 * they never burst past free-tier Whisper RPM or a cooling OmniRoute connection.
 *
 * Groq: https://console.groq.com/docs/rate-limits
 *   whisper-large-v3-turbo free plan: 20 RPM, 2K RPD, 7.2K ASH, 28.8K ASD
 *   x-ratelimit-remaining-requests is RPD; retry-after is only set on HTTP 429
 *
 * OmniRoute: GET /api/rate-limits (connections + lockouts), then at most one
 * chat completion. Skip when a connection has a future rateLimitedUntil or a
 * DeepSeek/OpenCode lockout.
 */

export const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

/** Free-plan Whisper RPM from Groq rate-limit docs. */
export const GROQ_WHISPER_RPM = 20;
export const GROQ_WHISPER_RPD = 2000;

/** One transcription per live run — well under 20 RPM / 2K RPD. */
export const MAX_LIVE_GROQ_TRANSCRIPTIONS = 1;
/** One chat completion per live run. Probe endpoints do not count. */
export const MAX_LIVE_OMNIROUTE_CHATS = 1;

/** Groq min file length is 0.01s; keep audio tiny vs 7.2K ASH. */
export const LIVE_WAV_SECONDS = 0.05;

export function groqAllowsTranscription(status: number, headers: Headers): {
  ok: boolean;
  reason?: string;
} {
  if (status === 429) {
    const retry = headers.get("retry-after");
    return {
      ok: false,
      reason: retry
        ? `Groq 429; retry-after ${retry}s. Live tests do not retry.`
        : "Groq 429. Live tests do not retry.",
    };
  }
  const remaining = headers.get("x-ratelimit-remaining-requests");
  if (remaining !== null && remaining !== "") {
    const n = Number(remaining);
    if (!Number.isNaN(n) && n < 1) {
      return { ok: false, reason: "Groq RPD remaining-requests is 0" };
    }
  }
  return { ok: true };
}

function isFutureTimestamp(value: unknown, now: number): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return ms > now;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return !Number.isNaN(parsed) && parsed > now;
  }
  return false;
}

function lockoutTouchesDeepSeek(value: Record<string, unknown>): boolean {
  const blob = JSON.stringify(value).toLowerCase();
  return (
    blob.includes("deepseek") ||
    blob.includes("opencode-go") ||
    blob.includes("opencode")
  );
}

/**
 * Walk OmniRoute GET /api/rate-limits JSON (connections, overview, lockouts).
 * Returns a skip reason if chat would likely 429.
 */
export function omnirouteChatBlocked(
  statusBody: unknown,
  now = Date.now(),
): string | null {
  return walkOmnirouteStatus(statusBody, now);
}

function walkOmnirouteStatus(value: unknown, now: number): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = walkOmnirouteStatus(item, now);
      if (hit) return hit;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;

  if (isFutureTimestamp(rec.rateLimitedUntil, now)) {
    return `OmniRoute connection is cooling down until ${String(rec.rateLimitedUntil)}`;
  }
  if (typeof rec.remaining === "number" && rec.remaining <= 0) {
    return "OmniRoute remaining quota is 0";
  }
  if (typeof rec.remainingMs === "number" && rec.remainingMs > 0) {
    if ("model" in rec || "reason" in rec) {
      if (!("model" in rec) || lockoutTouchesDeepSeek(rec)) {
        return `OmniRoute model lockout has ${rec.remainingMs}ms remaining`;
      }
    }
  }
  if (typeof rec.queued === "number" && rec.queued > 5) {
    return `OmniRoute limiter queue is ${rec.queued}; skip chat to avoid 429`;
  }

  for (const child of Object.values(rec)) {
    const hit = walkOmnirouteStatus(child, now);
    if (hit) return hit;
  }
  return null;
}

export function refuseRateLimitRetry(status: number): string | null {
  if (status === 429) {
    return "HTTP 429: live tests refuse to retry so they do not deepen the rate limit.";
  }
  return null;
}
