import type { Box, Scene, SceneInk, SceneNode, SizeToken } from "./types";

export const SIZE_PX: Record<SizeToken, { w: number; h: number }> = {
  sm: { w: 96, h: 56 },
  md: { w: 160, h: 80 },
  lg: { w: 224, h: 112 },
};

export function nodeSize(node: SceneNode): { w: number; h: number } {
  const base = SIZE_PX[node.size];
  let w = base.w;
  let h = base.h;
  if (node.shape === "cylinder") h = Math.round(h * 1.2);
  if (node.shape === "actor") {
    w = Math.round(w * 0.7);
    h = Math.round(h * 1.15);
  }
  if (node.rotation === 90) return { w: h, h: w };
  return { w, h };
}

export function nodeBox(node: SceneNode, fallback: Box = { x: 0, y: 0, w: 160, h: 80 }): Box {
  const size = nodeSize(node);
  const pin = node.pin ?? { x: fallback.x, y: fallback.y };
  return { x: pin.x, y: pin.y, w: size.w, h: size.h };
}

export function inkBBox(ink: SceneInk): Box {
  const points = ink.points ?? [];
  if (points.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = points[0][0];
  let minY = points[0][1];
  let maxX = minX;
  let maxY = minY;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
  };
}

export function boxesOverlap(a: Box, b: Box, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export function groupBox(scene: Scene, groupId: string, padding = 24): Box {
  const group = scene.groups[groupId];
  const boxes = (group?.contains ?? [])
    .map((id) => scene.nodes[id])
    .filter(Boolean)
    .map((node) => nodeBox(node));
  if (boxes.length === 0) return { x: 40, y: 40, w: 200, h: 120 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2,
  };
}

export function boxCenter(box: Box): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function containsBox(outer: Box, inner: Box): boolean {
  const c = boxCenter(inner);
  return (
    c.x >= outer.x &&
    c.x <= outer.x + outer.w &&
    c.y >= outer.y &&
    c.y <= outer.y + outer.h
  );
}
