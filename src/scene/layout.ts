import { boxesOverlap, nodeBox, nodeSize } from "./boxes";
import type { Scene } from "./types";

const LAYER_GAP = 80;
const RANK_GAP = 36;

export function layoutUnpinned(scene: Scene, scopeIds?: string[]): void {
  const ids = (scopeIds ?? Object.keys(scene.nodes)).filter(
    (id) => scene.nodes[id] && !scene.nodes[id].locked && !scene.nodes[id].pin,
  );
  if (!ids.length) return;
  const rank = ranks(scene, ids);
  const byRank = new Map<number, string[]>();
  for (const id of ids) {
    const r = rank.get(id) ?? 0;
    const list = byRank.get(r) ?? [];
    list.push(id);
    byRank.set(r, list);
  }
  const vertical = scene.board.flow === "top-to-bottom";
  for (const [r, list] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    list.forEach((id, i) => {
      const size = nodeSize(scene.nodes[id]);
      if (vertical) {
        scene.nodes[id].pin = {
          x: 80 + i * (size.w + RANK_GAP),
          y: 80 + r * (size.h + LAYER_GAP),
        };
      } else {
        scene.nodes[id].pin = {
          x: 80 + r * (size.w + LAYER_GAP),
          y: 80 + i * (size.h + RANK_GAP),
        };
      }
    });
  }
}

function ranks(scene: Scene, ids: string[]): Map<string, number> {
  const set = new Set(ids);
  const incoming = new Map<string, string[]>();
  for (const id of ids) incoming.set(id, []);
  for (const edge of Object.values(scene.edges)) {
    if (set.has(edge.from) && set.has(edge.to)) {
      incoming.get(edge.to)?.push(edge.from);
    }
  }
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  function walk(id: string): number {
    if (rank.has(id)) return rank.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = incoming.get(id) ?? [];
    const r = preds.length ? Math.max(...preds.map(walk)) + 1 : 0;
    visiting.delete(id);
    rank.set(id, r);
    return r;
  }
  for (const id of ids) walk(id);
  return rank;
}

export function unoverlap(scene: Scene, ids: string[]): void {
  const movable = ids.filter((id) => scene.nodes[id] && !scene.nodes[id].locked);
  let moved = true;
  let guard = 0;
  while (moved && guard < 40) {
    moved = false;
    guard += 1;
    for (let i = 0; i < movable.length; i++) {
      for (let j = i + 1; j < movable.length; j++) {
        const a = movable[i];
        const b = movable[j];
        const ba = nodeBox(scene.nodes[a]);
        const bb = nodeBox(scene.nodes[b]);
        if (!boxesOverlap(ba, bb, 8)) continue;
        const node = scene.nodes[b];
        if (!node.pin) node.pin = { x: bb.x, y: bb.y };
        node.pin.x = ba.x + ba.w + 24;
        moved = true;
      }
    }
  }
}

export function scopeNodeIds(scene: Scene, scope: "selection" | "board" | string): string[] {
  if (scope === "board") return Object.keys(scene.nodes);
  if (scope === "selection") {
    return scene.selection.filter((id) => id in scene.nodes);
  }
  if (scope in scene.groups) return [...scene.groups[scope].contains];
  return Object.keys(scene.nodes);
}
