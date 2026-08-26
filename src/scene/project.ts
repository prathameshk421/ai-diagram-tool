import { nodeBox } from "./boxes";
import { cloneJson } from "./clone";
import type { Rel, Scene, SceneView } from "./types";

function relation(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): Rel | null {
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  const acy = a.y + a.h / 2;
  const bcy = b.y + b.h / 2;
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlapY > Math.min(a.h, b.h) * 0.25) {
    if (a.x + a.w <= b.x) return "left_of";
    if (b.x + b.w <= a.x) return "right_of";
  }
  if (overlapX > Math.min(a.w, b.w) * 0.25) {
    if (a.y + a.h <= b.y) return "above";
    if (b.y + b.h <= a.y) return "below";
  }
  if (Math.abs(acx - bcx) >= Math.abs(acy - bcy)) {
    return acx <= bcx ? "left_of" : "right_of";
  }
  return acy <= bcy ? "above" : "below";
}

export function buildView(scene: Scene): SceneView {
  const ids = Object.keys(scene.nodes);
  const rel: SceneView["rel"] = {};
  for (const id of ids) {
    rel[id] = [];
    const box = nodeBox(scene.nodes[id]);
    for (const other of ids) {
      if (other === id) continue;
      const kind = relation(box, nodeBox(scene.nodes[other]));
      if (kind) rel[id].push(`${kind}:${other}`);
    }
  }
  const containsSpatial: Record<string, string[]> = {};
  for (const [gid, group] of Object.entries(scene.groups)) {
    containsSpatial[gid] = [...group.contains];
  }
  for (const [iid, ink] of Object.entries(scene.ink)) {
    if (!ink.points?.length) continue;
    const hull = {
      x: Math.min(...ink.points.map((p) => p[0])),
      y: Math.min(...ink.points.map((p) => p[1])),
      w: 1,
      h: 1,
    };
    const maxX = Math.max(...ink.points.map((p) => p[0]));
    const maxY = Math.max(...ink.points.map((p) => p[1]));
    hull.w = Math.max(1, maxX - hull.x);
    hull.h = Math.max(1, maxY - hull.y);
    containsSpatial[iid] = ids.filter((id) => {
      const box = nodeBox(scene.nodes[id]);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return cx >= hull.x && cx <= hull.x + hull.w && cy >= hull.y && cy <= hull.y + hull.h;
    });
  }
  return { rel, containsSpatial };
}

/** Agent-facing copy: strip ink points. Never the stored file. */
export function projectForAgent(scene: Scene): unknown {
  const copy = cloneJson(scene);
  for (const ink of Object.values(copy.ink)) {
    delete ink.points;
  }
  return {
    ...copy,
    view: buildView(scene),
  };
}
