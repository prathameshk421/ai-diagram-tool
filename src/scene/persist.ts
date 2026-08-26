import { emptyScene } from "./empty";
import { assertValid } from "./validate";
import { SCHEMA_ID, type Scene } from "./types";

const KEY = "ai-diagram-tool:scene";

function readStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function serializeScene(scene: Scene): string {
  return JSON.stringify(scene, null, 2);
}

export function parseScene(raw: string): Scene {
  const value = JSON.parse(raw) as Scene;
  if (value.schema !== SCHEMA_ID) {
    throw new Error("unsupported schema");
  }
  assertValid(value);
  return value;
}

/** `null` when nothing is stored (first visit). Corrupt JSON → empty scene. */
export function loadScene(): Scene | null {
  const store = readStorage();
  if (!store) return null;
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try {
    return parseScene(raw);
  } catch {
    return emptyScene();
  }
}

export function saveScene(scene: Scene): void {
  const store = readStorage();
  if (!store) return;
  store.setItem(KEY, serializeScene(scene));
}
