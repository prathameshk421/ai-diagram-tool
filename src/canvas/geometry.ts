import type { Box, Route } from "../scene/types";

export type BoardTool = "select" | "box" | "pen" | "connect";

export function edgePath(a: Box, b: Box, route: Route): string {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  if (route === "straight") {
    return `M ${ax} ${ay} L ${bx} ${by}`;
  }
  const mx = (ax + bx) / 2;
  return `M ${ax} ${ay} L ${mx} ${ay} L ${mx} ${by} L ${bx} ${by}`;
}

export function diamondPoints(box: Box): string {
  const { x, y, w, h } = box;
  return `${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`;
}

export function sizeTokenFromDrag(w: number, h: number): "sm" | "md" | "lg" {
  const m = Math.max(w, h);
  if (m < 110) return "sm";
  if (m < 190) return "md";
  return "lg";
}

export function pointInBox(x: number, y: number, box: Box): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return !(
    a.x + a.w < b.x ||
    b.x + b.w < a.x ||
    a.y + a.h < b.y ||
    b.y + b.h < a.y
  );
}

export function clientToWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  cam: { x: number; y: number; k: number },
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - cam.x) / cam.k,
    y: (clientY - rect.top - cam.y) / cam.k,
  };
}
