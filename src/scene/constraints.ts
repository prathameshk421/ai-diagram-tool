import { nodeBox, nodeSize } from "./boxes";
import type {
  AlignConstraint,
  Constraint,
  DistributeConstraint,
  EqualizeConstraint,
  GapConstraint,
  PlaceConstraint,
  Scene,
  SnapConstraint,
} from "./types";

function targetIds(scene: Scene, nodes?: string[]): string[] {
  const ids = nodes?.length ? nodes : scene.selection.filter((id) => id in scene.nodes);
  return ids.filter((id) => id in scene.nodes && !scene.nodes[id].locked);
}

export function applyConstraints(scene: Scene): Scene {
  for (const constraint of scene.constraints) {
    applyOne(scene, constraint);
  }
  scene.constraints = [];
  return scene;
}

function applyOne(scene: Scene, constraint: Constraint): void {
  if (constraint.op === "align") align(scene, constraint);
  else if (constraint.op === "distribute") distribute(scene, constraint);
  else if (constraint.op === "equalize") equalize(scene, constraint);
  else if (constraint.op === "snap") snap(scene, constraint);
  else if (constraint.op === "gap") gap(scene, constraint);
  else place(scene, constraint);
}

function ensurePin(scene: Scene, id: string): { x: number; y: number } {
  const node = scene.nodes[id];
  if (!node.pin) node.pin = { x: 40, y: 40 };
  return node.pin;
}

function align(scene: Scene, constraint: AlignConstraint): void {
  const ids = targetIds(scene, constraint.nodes);
  if (ids.length < 2) return;
  const boxes = ids.map((id) => ({ id, box: nodeBox(scene.nodes[id]) }));
  if (constraint.edge === "left") {
    const x = Math.min(...boxes.map((b) => b.box.x));
    for (const { id } of boxes) ensurePin(scene, id).x = x;
  } else if (constraint.edge === "right") {
    const right = Math.max(...boxes.map((b) => b.box.x + b.box.w));
    for (const { id, box } of boxes) ensurePin(scene, id).x = right - box.w;
  } else if (constraint.edge === "top") {
    const y = Math.min(...boxes.map((b) => b.box.y));
    for (const { id } of boxes) ensurePin(scene, id).y = y;
  } else if (constraint.edge === "bottom") {
    const bottom = Math.max(...boxes.map((b) => b.box.y + b.box.h));
    for (const { id, box } of boxes) ensurePin(scene, id).y = bottom - box.h;
  } else if (constraint.edge === "centerV") {
    const cx =
      boxes.reduce((s, b) => s + b.box.x + b.box.w / 2, 0) / boxes.length;
    for (const { id, box } of boxes) ensurePin(scene, id).x = cx - box.w / 2;
  } else {
    const cy =
      boxes.reduce((s, b) => s + b.box.y + b.box.h / 2, 0) / boxes.length;
    for (const { id, box } of boxes) ensurePin(scene, id).y = cy - box.h / 2;
  }
}

function distribute(scene: Scene, constraint: DistributeConstraint): void {
  const ids = targetIds(scene, constraint.nodes);
  if (ids.length < 3) return;
  const boxes = ids.map((id) => ({ id, box: nodeBox(scene.nodes[id]) }));
  if (constraint.axis === "h") {
    boxes.sort((a, b) => a.box.x - b.box.x);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const span = last.x + last.w - first.x;
    const widths = boxes.reduce((s, b) => s + b.box.w, 0);
    const gap = (span - widths) / (boxes.length - 1);
    let cursor = first.x;
    for (const item of boxes) {
      ensurePin(scene, item.id).x = cursor;
      cursor += item.box.w + gap;
    }
  } else {
    boxes.sort((a, b) => a.box.y - b.box.y);
    const first = boxes[0].box;
    const last = boxes[boxes.length - 1].box;
    const span = last.y + last.h - first.y;
    const heights = boxes.reduce((s, b) => s + b.box.h, 0);
    const gap = (span - heights) / (boxes.length - 1);
    let cursor = first.y;
    for (const item of boxes) {
      ensurePin(scene, item.id).y = cursor;
      cursor += item.box.h + gap;
    }
  }
}

function equalize(scene: Scene, constraint: EqualizeConstraint): void {
  const ids = targetIds(scene, constraint.nodes);
  if (ids.length < 2) return;
  const sizes = ids.map((id) => nodeSize(scene.nodes[id]));
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  for (const id of ids) {
    const node = scene.nodes[id];
    const cur = nodeSize(node);
    if (constraint.dim === "width" || constraint.dim === "both") {
      if (maxW >= 200 && cur.w < 200) node.size = "lg";
      else if (maxW >= 140 && cur.w < 140) node.size = node.size === "sm" ? "md" : node.size;
    }
    if (constraint.dim === "height" || constraint.dim === "both") {
      if (maxH >= 100 && node.size === "sm") node.size = "md";
      if (maxH >= 130) node.size = "lg";
    }
    const next = nodeSize(node);
    if (node.pin && (constraint.dim === "width" || constraint.dim === "both")) {
      node.pin.x -= (next.w - cur.w) / 2;
    }
    if (node.pin && (constraint.dim === "height" || constraint.dim === "both")) {
      node.pin.y -= (next.h - cur.h) / 2;
    }
  }
}

function snap(scene: Scene, constraint: SnapConstraint): void {
  const g = scene.board.grid;
  const ids = targetIds(scene, constraint.nodes);
  for (const id of ids) {
    const pin = ensurePin(scene, id);
    pin.x = Math.round(pin.x / g) * g;
    pin.y = Math.round(pin.y / g) * g;
  }
}

function gap(scene: Scene, constraint: GapConstraint): void {
  const ids = targetIds(scene, constraint.nodes);
  if (ids.length < 2) return;
  const min = constraint.min;
  const boxes = ids.map((id) => ({ id, box: nodeBox(scene.nodes[id]) }));
  boxes.sort((a, b) => a.box.x - b.box.x);
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1];
    const cur = boxes[i];
    const needed = prev.box.x + prev.box.w + min;
    if (cur.box.x < needed) {
      ensurePin(scene, cur.id).x = needed;
      cur.box.x = needed;
    }
  }
}

function place(scene: Scene, constraint: PlaceConstraint): void {
  if ("between" in constraint) {
    const [a, b] = constraint.between;
    if (!(a in scene.nodes) || !(b in scene.nodes) || !(constraint.node in scene.nodes)) {
      return;
    }
    const ba = nodeBox(scene.nodes[a]);
    const bb = nodeBox(scene.nodes[b]);
    const size = nodeSize(scene.nodes[constraint.node]);
    const cx = (ba.x + ba.w / 2 + bb.x + bb.w / 2) / 2 - size.w / 2;
    const cy = (ba.y + ba.h / 2 + bb.y + bb.h / 2) / 2 - size.h / 2;
    scene.nodes[constraint.node].pin = { x: cx, y: cy };
    return;
  }
  const target = scene.nodes[constraint.of];
  const moving = scene.nodes[constraint.node];
  if (!target || !moving) return;
  const tb = nodeBox(target);
  const size = nodeSize(moving);
  const gapPx = 32;
  let x = tb.x;
  let y = tb.y;
  if (constraint.side === "left") x = tb.x - size.w - gapPx;
  if (constraint.side === "right") x = tb.x + tb.w + gapPx;
  if (constraint.side === "above") y = tb.y - size.h - gapPx;
  if (constraint.side === "below") y = tb.y + tb.h + gapPx;
  if (constraint.side === "left" || constraint.side === "right") {
    y = tb.y + tb.h / 2 - size.h / 2;
  } else {
    x = tb.x + tb.w / 2 - size.w / 2;
  }
  moving.pin = { x, y };
}
