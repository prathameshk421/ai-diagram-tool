import { groupBox, inkBBox, nodeBox } from "../scene/boxes";
import type { Scene } from "../scene/types";
import { pointInBox } from "./geometry";

export function hitTest(scene: Scene, x: number, y: number): string | null {
  const nodeIds = Object.keys(scene.nodes).reverse();
  for (const id of nodeIds) {
    if (pointInBox(x, y, nodeBox(scene.nodes[id]))) return id;
  }
  const inkIds = Object.keys(scene.ink).reverse();
  for (const id of inkIds) {
    if (pointInBox(x, y, inkBBox(scene.ink[id]))) return id;
  }
  const groupIds = Object.keys(scene.groups).reverse();
  for (const id of groupIds) {
    if (pointInBox(x, y, groupBox(scene, id))) return id;
  }
  return null;
}
