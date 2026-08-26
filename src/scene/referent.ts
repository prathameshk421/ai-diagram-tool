import { buildView } from "./project";
import type { Rel, Scene } from "./types";

export type ReferentHit =
  | { status: "unique"; id: string }
  | { status: "ask"; say: string }
  | { status: "none"; say: string };

const COLOR =
  /\b(blue|red|green|yellow|orange|purple|pink|black|white|grey|gray)\b/i;

const SIDE: { re: RegExp; rel: Rel }[] = [
  { re: /\bon the left|to the left|left(?:most)?\b/i, rel: "left_of" },
  { re: /\bon the right|to the right|right(?:most)?\b/i, rel: "right_of" },
  { re: /\babove|on top\b/i, rel: "above" },
  { re: /\bbelow|under\b/i, rel: "below" },
];

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 1 &&
        ![
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
        ].includes(t),
    );
}

function matchesNode(scene: Scene, id: string, query: string): boolean {
  const node = scene.nodes[id];
  const blob = [id, node.label, node.kind, node.icon ?? "", node.shape]
    .join(" ")
    .toLowerCase();
  const words = tokens(query);
  if (!words.length) return false;
  return words.some((w) => blob.includes(w));
}

/**
 * Unique label/icon (case-insensitive), else selection / lastDrawn, else view.rel.
 * Ties and color queries ask. No vision.
 */
export function resolveReferent(scene: Scene, query: string): ReferentHit {
  const q = query.trim();
  if (!q) return { status: "none", say: "Nothing to target." };
  if (COLOR.test(q)) {
    return { status: "ask", say: "v1 cannot target by color." };
  }

  let candidates = Object.keys(scene.nodes).filter((id) =>
    matchesNode(scene, id, q),
  );

  if (/\bother\b/i.test(q) && scene.selection.length === 1) {
    const selected = scene.selection[0];
    const selectedNode = scene.nodes[selected];
    if (selectedNode) {
      const rest = Object.keys(scene.nodes).filter((id) => {
        if (id === selected) return false;
        const n = scene.nodes[id];
        return n.shape === selectedNode.shape || n.kind === selectedNode.kind;
      });
      if (rest.length === 1) return { status: "unique", id: rest[0] };
      if (rest.length > 1) {
        candidates = rest;
      }
    }
  }

  if (candidates.length > 1) {
    const side = SIDE.find((s) => s.re.test(q));
    if (side) {
      const view = buildView(scene);
      const narrowed = candidates.filter((id) => {
        const rels = view.rel[id] ?? [];
        return candidates.some(
          (other) => other !== id && rels.includes(`${side.rel}:${other}`),
        );
      });
      if (narrowed.length === 1) return { status: "unique", id: narrowed[0] };
      return {
        status: "ask",
        say: "Which one? Select it, or name a unique label.",
      };
    }
    return {
      status: "ask",
      say: "Which one? Select it, or name a unique label.",
    };
  }

  if (candidates.length === 1) return { status: "unique", id: candidates[0] };

  if (scene.selection.length === 1 && scene.selection[0] in scene.nodes) {
    return { status: "unique", id: scene.selection[0] };
  }
  if (scene.lastDrawn && scene.lastDrawn in scene.nodes) {
    return { status: "unique", id: scene.lastDrawn };
  }
  if (scene.selection.length > 1) {
    return { status: "ask", say: "Select a single object, then try again." };
  }
  return { status: "none", say: "Could not find that object." };
}
