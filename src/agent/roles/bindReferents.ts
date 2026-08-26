import { resolveReferent } from "../../scene/referent";
import type { Scene } from "../../scene/types";

const STOP = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "on",
  "to",
  "left",
  "right",
  "above",
  "below",
  "other",
  "one",
  "selected",
]);

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
}

function blobFor(scene: Scene, id: string): string {
  const node = scene.nodes[id];
  if (node) {
    return [id, node.label, node.kind, node.icon ?? "", node.shape]
      .join(" ")
      .toLowerCase();
  }
  const edge = scene.edges[id];
  if (!edge) return "";
  return [id, edge.label, edge.from, edge.to, edge.kind].join(" ").toLowerCase();
}

/** Node/edge ids the host resolver would have considered for this query. */
export function matchingReferentIds(scene: Scene, query: string): string[] {
  const words = queryTokens(query);
  if (!words.length) return [];
  return [...Object.keys(scene.nodes), ...Object.keys(scene.edges)].filter(
    (id) => {
      const blob = blobFor(scene, id);
      return words.some((word) => blob.includes(word));
    },
  );
}

export type BindReferentsResult =
  | { status: "ready"; ids: string[] }
  | { status: "ask"; say: string; candidates: string[] };

/**
 * Host-only referent bind. Never call the LLM here.
 * Exact node/edge ids pass through; everything else uses resolveReferent.
 */
export function bindReferents(
  scene: Scene,
  targetQueries: string[],
): BindReferentsResult {
  const ids: string[] = [];
  for (const raw of targetQueries) {
    const query = raw.trim();
    if (!query) continue;
    if (query in scene.nodes || query in scene.edges) {
      if (!ids.includes(query)) ids.push(query);
      continue;
    }
    const hit = resolveReferent(scene, query);
    if (hit.status === "ask") {
      return {
        status: "ask",
        say: hit.say,
        candidates: matchingReferentIds(scene, query),
      };
    }
    if (hit.status === "none") {
      return {
        status: "ask",
        say: hit.say || "Could not find that object.",
        candidates: matchingReferentIds(scene, query),
      };
    }
    if (!ids.includes(hit.id)) ids.push(hit.id);
  }
  return { status: "ready", ids };
}
