import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { diagramApi } from "../../server/proxy";

export function makeReq(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): IncomingMessage {
  const stream = Readable.from([opts.body ?? ""]);
  Object.assign(stream, {
    method: opts.method ?? "GET",
    url: opts.url,
    headers: opts.headers ?? {},
  });
  return stream as unknown as IncomingMessage;
}

export function makeRes(): ServerResponse & {
  bodyText: () => string;
  headers: Record<string, string>;
} {
  const chunks: string[] = [];
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string | number) {
      this.headers[name.toLowerCase()] = String(value);
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      }
    },
    bodyText: () => chunks.join(""),
  };
  return res as unknown as ServerResponse & {
    bodyText: () => string;
    headers: Record<string, string>;
  };
}

export async function formRequestParts(
  form: FormData,
  extraHeaders: Record<string, string>,
): Promise<{ headers: Record<string, string>; body: Buffer }> {
  const request = new Request("http://diagram.test/", {
    method: "POST",
    headers: extraHeaders,
    body: form,
  });
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const body = Buffer.from(await request.arrayBuffer());
  return { headers, body };
}

export async function callDiagramApi(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}) {
  const res = makeRes();
  await diagramApi(
    makeReq(opts),
    res,
    () => {
      throw new Error("proxy fell through");
    },
  );
  return res;
}
