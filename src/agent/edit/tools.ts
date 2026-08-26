import { defaultNode } from "../../scene/empty";
import { idTaken, nextId } from "../../scene/ids";
import { compile } from "../../scene/kernel";
import { bumpSize } from "../../scene/passes";
import { AgentWriteError } from "../../scene/patch";
import { resolveReferent, type ReferentHit } from "../../scene/referent";
import { deleteAndRetarget } from "../../scene/structure";
import {
  ID_PATTERN,
  type AlignEdge,
  type Constraint,
  type DistributeAxis,
  type EqualizeDim,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "../../scene/types";
import type {
  EditError,
  EditPlanContext,
  EditToolCall,
  PlaceArgs,
  SemanticEdgePatch,
  SemanticNodePatch,
  SemanticNodeSpec,
} from "./types";

const GEOMETRY_KEYS = new Set(["pin", "x", "y", "width", "height", "points", "cx", "cy"]);

export type ToolOutcome =
  | { status: "ok"; scene: Scene }
  | { status: "ask"; say: string }
  | { status: "error"; say: string; errors: EditError[] };

export function applyTool(
  scene: Scene,
  call: EditToolCall,
  ctx: EditPlanContext,
): ToolOutcome {
  try {
    return applyToolInner(scene, call, ctx);
  } catch (error) {
    const message =
      error instanceof AgentWriteError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not apply that edit.";
    return {
      status: "error",
      say: message,
      errors: [{ code: "APPLY", message }],
    };
  }
}

function applyToolInner(
  scene: Scene,
  call: EditToolCall,
  ctx: EditPlanContext,
): ToolOutcome {
  switch (call.tool) {
    case "ask":
      return { status: "ask", say: call.args.say };
    case "add_node":
      return addNode(scene, call.args.id, call.args.spec, ctx);
    case "insert_on_path":
      return insertOnPath(scene, call.args.node, call.args.on, ctx);
    case "add_edge":
      return addEdge(scene, call.args.from, call.args.to, call.args.props, ctx);
    case "remove_node":
      return removeNode(scene, call.args.remove, call.args.retarget_to);
    case "merge_nodes":
      return mergeNodes(scene, call.args.ids, call.args.keep);
    case "set_node":
      return setNode(scene, call.args.target, call.args.patch);
    case "update_edge":
      return updateEdge(scene, call.args.edge, call.args.patch);
    case "remove_edge":
      return removeEdge(scene, call.args.edge);
    case "align":
      return pushConstraint(scene, {
        op: "align",
        edge: call.args.edge,
        nodes: call.args.nodes,
      });
    case "distribute":
      return pushConstraint(scene, {
        op: "distribute",
        axis: call.args.axis,
        nodes: call.args.nodes,
      });
    case "equalize":
      return pushConstraint(scene, {
        op: "equalize",
        dim: call.args.dim,
        nodes: call.args.nodes,
      });
    case "snap":
      return pushConstraint(scene, { op: "snap", nodes: call.args.nodes });
    case "place":
      return place(scene, call.args);
    case "beautify":
      scene.passes.push({ type: "beautify", scope: call.args.scope });
      return okCompile(scene);
    case "convert_ink":
      scene.passes.push({ type: "convert-ink", ids: call.args.ids });
      return okCompile(scene);
    case "tidy_layout":
      scene.passes.push({ type: "tidy-layout", scope: call.args.scope });
      return okCompile(scene);
    case "unoverlap":
      scene.passes.push({ type: "unoverlap", scope: call.args.scope });
      return okCompile(scene);
    case "restyle_icons":
      scene.passes.push({ type: "restyle-icons" });
      return okCompile(scene);
    case "annotate_path":
      return annotatePath(scene, call.args.from, call.args.to);
    case "unpin":
      return unpin(scene, call.args.target);
    case "bump_size":
      return bump(scene, call.args.dir, call.args.nodes);
    case "rotate":
      return rotate(scene, call.args.nodes);
  }
}

function okCompile(scene: Scene): ToolOutcome {
  compile(scene);
  return { status: "ok", scene };
}

function fail(code: string, message: string): ToolOutcome {
  return { status: "error", say: message, errors: [{ code, message }] };
}

function existingId(scene: Scene, query: string): boolean {
  return query in scene.nodes || query in scene.edges || query in scene.groups;
}

function resolveTarget(scene: Scene, query: string): ReferentHit {
  const q = query.trim();
  if (!q) return { status: "none", say: "Nothing to target." };
  if (existingId(scene, q)) return { status: "unique", id: q };
  return resolveReferent(scene, q);
}

function hitToOutcome(hit: ReferentHit): ToolOutcome | { status: "unique"; id: string } {
  if (hit.status === "unique") return hit;
  if (hit.status === "ask") return { status: "ask", say: hit.say };
  return fail("UNKNOWN_TARGET", hit.say);
}

function resolveList(scene: Scene, queries: string[] | undefined): ToolOutcome | { ids: string[] } {
  if (!queries?.length) return { ids: [] };
  const ids: string[] = [];
  for (const query of queries) {
    const hit = hitToOutcome(resolveTarget(scene, query));
    if (hit.status !== "unique") return hit;
    ids.push(hit.id);
  }
  return { ids };
}

function namedInTranscript(id: string, label: string, transcript: string): boolean {
  const blob = transcript.toLowerCase();
  if (blob.includes(id.toLowerCase())) return true;
  const name = label.toLowerCase();
  return Boolean(name) && blob.includes(name);
}

function hasGeometry(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasGeometry);
  if (typeof value !== "object" || value === null) return false;
  for (const [key, child] of Object.entries(value)) {
    if (GEOMETRY_KEYS.has(key)) return true;
    if (hasGeometry(child)) return true;
  }
  return false;
}

function addNode(
  scene: Scene,
  idArg: string | undefined,
  spec: SemanticNodeSpec,
  ctx: EditPlanContext,
): ToolOutcome {
  if (hasGeometry(spec)) {
    return fail("FORBIDDEN_GEOMETRY", "Agents cannot write coordinates.");
  }
  const id = idArg ?? nextId(scene, "n_");
  if (!ID_PATTERN.test(id)) {
    return fail("INVALID_ID", `invalid node id ${id}`);
  }
  if (idTaken(scene, id)) {
    return fail("ID_TAKEN", `id already exists: ${id}`);
  }
  if (scene.meta.strict && !namedInTranscript(id, spec.label, ctx.transcript)) {
    return {
      status: "ask",
      say: "Strict mode: that would add a node you didn't name.",
    };
  }
  scene.nodes[id] = defaultNode({
    kind: spec.kind ?? "unknown",
    label: spec.label,
    icon: spec.icon ?? null,
    shape: spec.shape ?? "rectangle",
    size: spec.size ?? "md",
    style: spec.style ?? "sketch",
  });
  return okCompile(scene);
}

function resolveEdgeOn(scene: Scene, on: string): ToolOutcome | { id: string } {
  if (on in scene.edges) return { id: on };
  const fromTo = on.match(/^(.+)_to_(.+)$/);
  if (fromTo) {
    const matches = Object.entries(scene.edges).filter(
      ([, edge]) => edge.from === fromTo[1] && edge.to === fromTo[2],
    );
    if (matches.length === 1) return { id: matches[0][0] };
  }
  const hit = hitToOutcome(resolveTarget(scene, on));
  if (hit.status !== "unique") {
    if (hit.status === "ask") return hit;
    return fail("UNKNOWN_EDGE", "unknown edge");
  }
  if (hit.id in scene.edges) return { id: hit.id };
  const incoming = Object.entries(scene.edges).filter(([, edge]) => edge.to === hit.id);
  if (incoming.length === 1) return { id: incoming[0][0] };
  const incident = Object.entries(scene.edges).filter(
    ([, edge]) => edge.from === hit.id || edge.to === hit.id,
  );
  if (incident.length === 1) return { id: incident[0][0] };
  return fail("UNKNOWN_EDGE", "unknown edge");
}

function insertOnPath(
  scene: Scene,
  nodeQuery: string,
  on: string,
  ctx: EditPlanContext,
): ToolOutcome {
  const edgeHit = resolveEdgeOn(scene, on);
  if (!("id" in edgeHit)) return edgeHit;
  const edgeId = edgeHit.id;

  let nodeId = nodeQuery.trim();
  if (!(nodeId in scene.nodes)) {
    const referent = resolveReferent(scene, nodeId);
    if (referent.status === "ask") return { status: "ask", say: referent.say };
    if (referent.status === "unique") {
      nodeId = referent.id;
    } else if (ID_PATTERN.test(nodeId)) {
      if (scene.meta.strict && !namedInTranscript(nodeId, nodeId, ctx.transcript)) {
        return {
          status: "ask",
          say: "Strict mode: that would add a node you didn't name.",
        };
      }
      scene.nodes[nodeId] = defaultNode({
        kind: "unknown",
        label: nodeId,
        style: "clean",
      });
    } else {
      const minted = nextId(scene, "n_");
      if (scene.meta.strict && !namedInTranscript(minted, nodeQuery, ctx.transcript)) {
        return {
          status: "ask",
          say: "Strict mode: that would add a node you didn't name.",
        };
      }
      scene.nodes[minted] = defaultNode({
        kind: "unknown",
        label: nodeQuery,
        style: "clean",
      });
      nodeId = minted;
    }
  }

  scene.passes.push({ type: "insert", node: nodeId, on: edgeId });
  return okCompile(scene);
}

function addEdge(
  scene: Scene,
  fromArg: string,
  toArg: string,
  props: SemanticEdgePatch | undefined,
  ctx: EditPlanContext,
): ToolOutcome {
  if (props && hasGeometry(props)) {
    return fail("FORBIDDEN_GEOMETRY", "Agents cannot write coordinates.");
  }
  let from = fromArg.trim();
  let to = toArg.trim();
  if (!from || !to) {
    const selected = scene.selection.filter((id) => id in scene.nodes);
    if (selected.length < 2) {
      return okCompile(scene);
    }
    if (!from) from = selected[0];
    if (!to) to = selected[1];
  }
  const fromHit = hitToOutcome(resolveTarget(scene, from));
  if (fromHit.status !== "unique") return fromHit;
  const toHit = hitToOutcome(resolveTarget(scene, to));
  if (toHit.status !== "unique") return toHit;
  from = fromHit.id;
  to = toHit.id;
  if (!(from in scene.nodes) && !(from in scene.groups)) {
    return fail("UNKNOWN_TARGET", "edge endpoints must exist");
  }
  if (!(to in scene.nodes) && !(to in scene.groups)) {
    return fail("UNKNOWN_TARGET", "edge endpoints must exist");
  }
  const label = props?.label ?? "";
  if (
    scene.meta.strict &&
    label &&
    !namedInTranscript("", label, ctx.transcript)
  ) {
    return {
      status: "ask",
      say: "Strict mode: that would add an edge you didn't name.",
    };
  }
  const id = nextId(scene, "e_");
  const edge: SceneEdge = {
    from,
    to,
    label,
    kind: props?.kind ?? "sync",
    stroke: props?.stroke ?? "solid",
    route: props?.route ?? "straight",
    exposure: props?.exposure ?? null,
  };
  scene.edges[id] = edge;
  return okCompile(scene);
}

function removeNode(scene: Scene, remove: string, retargetTo: string): ToolOutcome {
  const removeHit = hitToOutcome(resolveTarget(scene, remove));
  if (removeHit.status !== "unique") return removeHit;
  const keepHit = hitToOutcome(resolveTarget(scene, retargetTo));
  if (keepHit.status !== "unique") return keepHit;
  const next = deleteAndRetarget(scene, removeHit.id, keepHit.id);
  return { status: "ok", scene: next };
}

function mergeNodes(scene: Scene, ids: string[], keep: string): ToolOutcome {
  const resolved = resolveList(scene, ids);
  if (!("ids" in resolved)) return resolved;
  const keepHit = hitToOutcome(resolveTarget(scene, keep));
  if (keepHit.status !== "unique") return keepHit;
  scene.passes.push({ type: "merge", ids: resolved.ids, keep: keepHit.id });
  return okCompile(scene);
}

function setNode(scene: Scene, target: string, patch: SemanticNodePatch): ToolOutcome {
  if (hasGeometry(patch)) {
    return fail("FORBIDDEN_GEOMETRY", "Agents cannot write coordinates.");
  }
  const hit = hitToOutcome(resolveTarget(scene, target));
  if (hit.status !== "unique") return hit;
  if (!(hit.id in scene.nodes)) {
    return fail("UNKNOWN_TARGET", "target is not a node");
  }
  const node: SceneNode = scene.nodes[hit.id];
  if (patch.kind !== undefined) node.kind = patch.kind;
  if (patch.label !== undefined) node.label = patch.label;
  if (patch.icon !== undefined) node.icon = patch.icon;
  if (patch.shape !== undefined) node.shape = patch.shape;
  if (patch.size !== undefined) node.size = patch.size;
  if (patch.style !== undefined) node.style = patch.style;
  if (patch.locked !== undefined) node.locked = patch.locked;
  if (patch.rotation !== undefined) node.rotation = patch.rotation;
  return okCompile(scene);
}

function updateEdge(scene: Scene, edgeQuery: string, patch: SemanticEdgePatch): ToolOutcome {
  if (hasGeometry(patch)) {
    return fail("FORBIDDEN_GEOMETRY", "Agents cannot write coordinates.");
  }
  const hit = hitToOutcome(resolveTarget(scene, edgeQuery));
  if (hit.status !== "unique") return hit;
  const edge = scene.edges[hit.id];
  if (!edge) return fail("UNKNOWN_EDGE", "unknown edge");
  if (patch.label !== undefined) edge.label = patch.label;
  if (patch.kind !== undefined) edge.kind = patch.kind;
  if (patch.stroke !== undefined) edge.stroke = patch.stroke;
  if (patch.route !== undefined) edge.route = patch.route;
  if (patch.exposure !== undefined) edge.exposure = patch.exposure;
  return okCompile(scene);
}

function removeEdge(scene: Scene, edgeQuery: string): ToolOutcome {
  const hit = hitToOutcome(resolveTarget(scene, edgeQuery));
  if (hit.status !== "unique") return hit;
  if (!(hit.id in scene.edges)) return fail("UNKNOWN_EDGE", "unknown edge");
  delete scene.edges[hit.id];
  return okCompile(scene);
}

type LayoutConstraint =
  | { op: "align"; edge: AlignEdge; nodes?: string[] }
  | { op: "distribute"; axis: DistributeAxis; nodes?: string[] }
  | { op: "equalize"; dim: EqualizeDim; nodes?: string[] }
  | { op: "snap"; nodes?: string[] };

function pushConstraint(scene: Scene, constraint: LayoutConstraint): ToolOutcome {
  const resolved = resolveList(scene, constraint.nodes);
  if (!("ids" in resolved)) return resolved;
  const next: LayoutConstraint = resolved.ids.length
    ? { ...constraint, nodes: resolved.ids }
    : { ...constraint };
  if (!resolved.ids.length) delete next.nodes;
  scene.constraints.push(next as Constraint);
  return okCompile(scene);
}

function place(scene: Scene, args: PlaceArgs): ToolOutcome {
  const nodeHit = hitToOutcome(resolveTarget(scene, args.node));
  if (nodeHit.status !== "unique") return nodeHit;
  if ("between" in args) {
    const a = hitToOutcome(resolveTarget(scene, args.between[0]));
    if (a.status !== "unique") return a;
    const b = hitToOutcome(resolveTarget(scene, args.between[1]));
    if (b.status !== "unique") return b;
    scene.constraints.push({
      op: "place",
      node: nodeHit.id,
      between: [a.id, b.id],
    });
  } else {
    const ofHit = hitToOutcome(resolveTarget(scene, args.of));
    if (ofHit.status !== "unique") return ofHit;
    scene.constraints.push({
      op: "place",
      node: nodeHit.id,
      side: args.side,
      of: ofHit.id,
    });
  }
  return okCompile(scene);
}

function annotatePath(scene: Scene, from: string, to: string): ToolOutcome {
  const fromHit = hitToOutcome(resolveTarget(scene, from));
  if (fromHit.status !== "unique") return fromHit;
  const toHit = hitToOutcome(resolveTarget(scene, to));
  if (toHit.status !== "unique") return toHit;
  scene.passes.push({ type: "annotate-path", from: fromHit.id, to: toHit.id });
  return okCompile(scene);
}

function unpin(scene: Scene, target: string): ToolOutcome {
  const hit = hitToOutcome(resolveTarget(scene, target));
  if (hit.status !== "unique") return hit;
  if (!(hit.id in scene.nodes)) {
    return fail("UNKNOWN_TARGET", "target is not a node");
  }
  delete scene.nodes[hit.id].pin;
  return okCompile(scene);
}

function targetNodeIds(scene: Scene, nodes: string[] | undefined): ToolOutcome | { ids: string[] } {
  if (nodes?.length) return resolveList(scene, nodes);
  return { ids: scene.selection.filter((id) => id in scene.nodes) };
}

function bump(scene: Scene, dir: 1 | -1, nodes?: string[]): ToolOutcome {
  const resolved = targetNodeIds(scene, nodes);
  if (!("ids" in resolved)) return resolved;
  for (const id of resolved.ids) {
    scene.nodes[id].size = bumpSize(scene.nodes[id].size, dir);
  }
  return okCompile(scene);
}

function rotate(scene: Scene, nodes?: string[]): ToolOutcome {
  const resolved = targetNodeIds(scene, nodes);
  if (!("ids" in resolved)) return resolved;
  for (const id of resolved.ids) {
    scene.nodes[id].rotation = scene.nodes[id].rotation === 90 ? 0 : 90;
  }
  return okCompile(scene);
}
