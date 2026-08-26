import { cloneJson } from "./clone";
import { compile } from "./kernel";
import type { Scene } from "./types";

/**
 * Delete a node and retarget every edge. Dangling from/to is invalid.
 */
export function deleteAndRetarget(
  scene: Scene,
  removeId: string,
  retargetTo: string,
): Scene {
  const next = cloneJson(scene);
  if (!(retargetTo in next.nodes) && !(retargetTo in next.groups)) {
    throw new Error("retarget target missing");
  }
  if (!(removeId in next.nodes)) {
    throw new Error("node to delete missing");
  }
  for (const [eid, edge] of Object.entries(next.edges)) {
    if (edge.from === removeId) edge.from = retargetTo;
    if (edge.to === removeId) edge.to = retargetTo;
    if (edge.from === edge.to) delete next.edges[eid];
  }
  for (const group of Object.values(next.groups)) {
    group.contains = [
      ...new Set(
        group.contains
          .filter((id) => id !== removeId)
          .map((id) => (id === removeId ? retargetTo : id)),
      ),
    ];
  }
  delete next.nodes[removeId];
  next.selection = next.selection.filter((id) => id !== removeId);
  if (next.lastDrawn === removeId) next.lastDrawn = retargetTo;
  return compile(next);
}
