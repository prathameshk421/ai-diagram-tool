import { cloneJson } from "../scene/clone";
import { defaultNode } from "../scene/empty";
import { nextId } from "../scene/ids";
import { nodeBox } from "../scene/boxes";
import type { Scene } from "../scene/types";
import { boxesIntersect, rectFromCorners, sizeTokenFromDrag } from "./geometry";

const MIN_BOX = 16;

export function commitDrawnBox(
  scene: Scene,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Scene | null {
  const box = rectFromCorners(x0, y0, x1, y1);
  if (box.w <= MIN_BOX || box.h <= MIN_BOX) return null;
  const next = cloneJson(scene);
  const id = nextId(next, "n_");
  next.nodes[id] = defaultNode({
    label: "",
    pin: { x: box.x, y: box.y },
    size: sizeTokenFromDrag(box.w, box.h),
    style: next.board.style,
  });
  next.selection = [id];
  next.lastDrawn = id;
  return next;
}

export function commitPenStroke(
  scene: Scene,
  points: [number, number][],
): Scene | null {
  if (points.length < 2) return null;
  const next = cloneJson(scene);
  const id = nextId(next, "stroke_");
  next.ink[id] = { convert: null, points };
  next.selection = [id];
  next.lastDrawn = id;
  return next;
}

export function commitMarquee(scene: Scene, box: {
  x: number;
  y: number;
  w: number;
  h: number;
}): Scene {
  const next = cloneJson(scene);
  next.selection = Object.keys(next.nodes).filter((id) =>
    boxesIntersect(box, nodeBox(next.nodes[id])),
  );
  return next;
}
