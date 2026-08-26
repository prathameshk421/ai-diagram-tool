import type { Scene } from "../../scene/types";
import type { SemanticDiff } from "./types";

/** Topology / label / kind only. Never pin, x, y, width, height, or points. */
export function semanticDiff(before: Scene, after: Scene): SemanticDiff {
  const nodesAdded = Object.keys(after.nodes).filter((id) => !(id in before.nodes));
  const nodesRemoved = Object.keys(before.nodes).filter((id) => !(id in after.nodes));
  const edgesAdded = Object.keys(after.edges).filter((id) => !(id in before.edges));
  const edgesRemoved = Object.keys(before.edges).filter((id) => !(id in after.edges));
  const labelsChanged: string[] = [];
  const kindsChanged: string[] = [];
  for (const id of Object.keys(after.nodes)) {
    const prev = before.nodes[id];
    if (!prev) continue;
    if (prev.label !== after.nodes[id].label) labelsChanged.push(id);
    if (prev.kind !== after.nodes[id].kind) kindsChanged.push(id);
  }
  for (const id of Object.keys(after.edges)) {
    const prev = before.edges[id];
    if (!prev) continue;
    if (prev.label !== after.edges[id].label) labelsChanged.push(id);
    if (prev.kind !== after.edges[id].kind) kindsChanged.push(id);
  }
  return {
    nodesAdded,
    nodesRemoved,
    edgesAdded,
    edgesRemoved,
    labelsChanged,
    kindsChanged,
  };
}

export const EMPTY_DIFF: SemanticDiff = {
  nodesAdded: [],
  nodesRemoved: [],
  edgesAdded: [],
  edgesRemoved: [],
  labelsChanged: [],
  kindsChanged: [],
};
