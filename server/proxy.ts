import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin, PreviewServer, ViteDevServer } from "vite";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const STT_PROXY_MS = 30_000;
const INTENT_PROXY_MS = 60_000;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function bearerToken(req: IncomingMessage): string | null {
  const raw = header(req, "authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(\S+)/i.exec(raw);
  return match?.[1] ?? null;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

async function handleTranscribe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "missing_groq_key" });
    return;
  }
  const body = await readBody(req);
  const contentType = header(req, "content-type") ?? "multipart/form-data";
  try {
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(STT_PROXY_MS),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    res.end(text);
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (aborted) {
      sendJson(res, 504, { error: "upstream_timeout" });
      return;
    }
    sendJson(res, 502, { error: "upstream_unreachable" });
  }
}

async function handleIntent(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: "missing_omniroute_key" });
    return;
  }
  const baseHeader = header(req, "x-omniroute-base");
  if (!baseHeader) {
    sendJson(res, 400, { error: "missing_omniroute_base" });
    return;
  }
  const raw = await readBody(req);
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const url = `${stripSlash(baseHeader)}/v1/chat/completions`;
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INTENT_PROXY_MS),
    });
    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json",
    );
    res.end(text);
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "TimeoutError" || err.name === "AbortError");
    if (aborted) {
      sendJson(res, 504, { error: "upstream_timeout" });
      return;
    }
    sendJson(res, 502, { error: "upstream_unreachable" });
  }
}

function mount(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    void diagramApi(req, res, next);
  });
}

/** Connect handler. Exported so tests can hit auth locks without Vite or live APIs. */
export async function diagramApi(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const url = req.url?.split("?")[0] ?? "";
  if (url === "/api/transcribe") {
    if (req.method !== "POST") {
      if (!bearerToken(req)) {
        sendJson(res, 401, { error: "missing_groq_key" });
        return;
      }
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end();
      return;
    }
    await handleTranscribe(req, res);
    return;
  }
  if (url === "/api/intent") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    await handleIntent(req, res);
    return;
  }
  next();
}

export function diagramProxyPlugin(): Plugin {
  return {
    name: "diagram-proxy",
    configureServer(server: ViteDevServer) {
      mount(server.middlewares);
    },
    configurePreviewServer(server: PreviewServer) {
      mount(server.middlewares);
    },
  };
}
