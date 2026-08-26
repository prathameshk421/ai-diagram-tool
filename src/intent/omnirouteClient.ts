import type { Settings } from "../settings/store";
import { SYSTEM_PROMPT } from "./systemPrompt";
import {
  type Command,
  parseCommandJson,
  unknownCommand,
} from "./types";

const INTENT_TIMEOUT_MS = 4000;

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

function buildBody(
  settings: Settings,
  transcript: string,
  selectionCount: number,
  includeThinking: boolean,
  selection: string[] = [],
): ChatBody {
  const body: ChatBody = {
    model: settings.omnirouteModel,
    temperature: 0,
    stream: false,
    max_tokens: 200,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ transcript, selectionCount, selection }),
      },
    ],
  };
  if (includeThinking) {
    body.thinking = { type: "disabled" };
  }
  return body;
}

function commandFromResponse(raw: string): Command {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return unknownCommand();
  }
  const record = parsed as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = record.choices?.[0]?.message?.content;
  if (typeof content !== "string") return unknownCommand();
  const command = parseCommandJson(content);
  if (!command) return unknownCommand();
  if (command.confidence < 0.45) return unknownCommand();
  return command;
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

export async function requestIntent(
  settings: Settings,
  transcript: string,
  selectionCount: number,
  selection: string[] = [],
): Promise<Command> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTENT_TIMEOUT_MS);
  try {
    let body = buildBody(settings, transcript, selectionCount, true, selection);
    let response = await postIntent(settings, body, controller.signal);
    if (response.status === 400) {
      await response.text();
      body = buildBody(
        settings,
        transcript,
        selectionCount,
        false,
        selection,
      );
      response = await postIntent(settings, body, controller.signal);
    }
    const raw = await response.text();
    if (!response.ok) return unknownCommand();
    return commandFromResponse(raw);
  } catch {
    return unknownCommand();
  } finally {
    clearTimeout(timer);
  }
}
