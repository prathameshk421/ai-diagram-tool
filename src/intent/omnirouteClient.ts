import { ROLE_BUDGETS, type ChatRole } from "../agent/pipeline/budgets";
import type { Settings } from "../settings/store";
import { SYSTEM_PROMPT } from "./systemPrompt";
import {
  type Command,
  parseCommandJson,
  unknownCommand,
} from "./types";

export type ChatRoleResult =
  | { ok: true; content: string; status: number }
  | {
      ok: false;
      error: "http" | "abort" | "network";
      status?: number;
      body?: string;
    };

type ChatBody = {
  model: string;
  temperature: number;
  stream: false;
  max_tokens: number;
  thinking?: { type: "disabled" };
  messages: { role: string; content: string }[];
};

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "AbortError" || name === "TimeoutError";
}

function buildChatBody(
  settings: Settings,
  system: string,
  payload: unknown,
  maxTokens: number,
  includeThinking: boolean,
): ChatBody {
  const body: ChatBody = {
    model: settings.omnirouteModel,
    temperature: 0,
    stream: false,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(payload) },
    ],
  };
  if (includeThinking) {
    body.thinking = { type: "disabled" };
  }
  return body;
}

async function postIntent(
  settings: Settings,
  body: ChatBody,
  signal: AbortSignal,
): Promise<Response> {
  return fetch("/api/intent", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.omnirouteApiKey}`,
      "X-OmniRoute-Base": stripSlash(settings.omnirouteUrl),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

function contentFromRaw(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const record = parsed as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = record.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

export async function requestChatRole(opts: {
  settings: Settings;
  role: ChatRole;
  system: string;
  payload: unknown;
  signal?: AbortSignal;
}): Promise<ChatRoleResult> {
  const budget = ROLE_BUDGETS[opts.role];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget.timeoutMs);
  const onExtraAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onExtraAbort, { once: true });
  }

  const post = (includeThinking: boolean) =>
    postIntent(
      opts.settings,
      buildChatBody(
        opts.settings,
        opts.system,
        opts.payload,
        budget.maxTokens,
        includeThinking,
      ),
      controller.signal,
    );

  try {
    let response = await post(true);
    if (response.status === 400) {
      await response.text();
      response = await post(false);
    }
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, error: "http", status: response.status, body: raw };
    }
    const content = contentFromRaw(raw);
    if (content === null) {
      return { ok: false, error: "http", status: response.status, body: raw };
    }
    return { ok: true, content, status: response.status };
  } catch (err) {
    if (isAbortError(err)) return { ok: false, error: "abort" };
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExtraAbort);
  }
}

export async function requestIntent(
  settings: Settings,
  transcript: string,
  selectionCount: number,
  selection: string[] = [],
): Promise<Command> {
  const result = await requestChatRole({
    settings,
    role: "command",
    system: SYSTEM_PROMPT,
    payload: { transcript, selectionCount, selection },
  });
  if (!result.ok) return unknownCommand();
  const command = parseCommandJson(result.content);
  if (!command) return unknownCommand();
  if (command.confidence < 0.45) return unknownCommand();
  return command;
}
