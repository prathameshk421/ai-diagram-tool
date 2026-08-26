import { cloneJson } from "./clone";
import { FORBIDDEN_WRITE_KEYS, type JsonPatchOp, type Scene } from "./types";

export class AgentWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentWriteError";
  }
}

function decodePointer(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function pointerForbidden(path: string): boolean {
  const parts = path.split("/").filter(Boolean).map(decodePointer);
  return parts.some((part) => FORBIDDEN_WRITE_KEYS.has(part));
}

function getAt(root: unknown, parts: string[]): { parent: Record<string, unknown> | unknown[]; key: string | number; value: unknown } | null {
  if (parts.length === 0) return null;
  let cursor: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cursor !== "object" || cursor === null) return null;
    const key = parts[i];
    cursor = Array.isArray(cursor)
      ? cursor[Number(key)]
      : (cursor as Record<string, unknown>)[key];
  }
  const last = parts[parts.length - 1];
  if (typeof cursor !== "object" || cursor === null) return null;
  if (Array.isArray(cursor)) {
    return { parent: cursor, key: Number(last), value: cursor[Number(last)] };
  }
  return {
    parent: cursor as Record<string, unknown>,
    key: last,
    value: (cursor as Record<string, unknown>)[last],
  };
}

export function applyJsonPatch(scene: Scene, ops: JsonPatchOp[]): Scene {
  const next = cloneJson(scene);
  for (const op of ops) {
    if (pointerForbidden(op.path)) {
      throw new AgentWriteError(`forbidden path ${op.path}`);
    }
    const parts = op.path.split("/").filter(Boolean).map(decodePointer);
    const slot = getAt(next, parts);
    if (!slot) throw new AgentWriteError(`path not found ${op.path}`);
    if (op.op === "remove") {
      if (Array.isArray(slot.parent)) slot.parent.splice(Number(slot.key), 1);
      else delete slot.parent[slot.key];
    } else if (op.op === "add" || op.op === "replace") {
      if (valueHasForbidden(op.value)) {
        throw new AgentWriteError("forbidden keys in patch value");
      }
      if (Array.isArray(slot.parent)) {
        if (op.op === "add") slot.parent.splice(Number(slot.key), 0, op.value);
        else slot.parent[Number(slot.key)] = op.value;
      } else {
        slot.parent[slot.key] = op.value;
      }
    }
  }
  return next;
}

function valueHasForbidden(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(valueHasForbidden);
  if (typeof value !== "object" || value === null) return false;
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_WRITE_KEYS.has(k)) return true;
    if (valueHasForbidden(v)) return true;
  }
  return false;
}
