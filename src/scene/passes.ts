import { inkBBox, nodeBox, nodeSize } from "./boxes";
import { defaultNode } from "./empty";
import { idTaken, isSceneId, nextId } from "./ids";
import { layoutUnpinned, scopeNodeIds, unoverlap } from "./layout";
import { spatialContains } from "./validate";
import type {
  Icon,
  InkConvert,
  InsertPass,
  MergePass,
  NodeKind,
  Pass,
  Scene,
  Shape,
} from "./types";

const KIND_ICON: Record<string, Icon> = {
  datastore: "database",
  cache: "redis",
  queue: "kafka",
  bucket: "s3",
  gateway: "apigw",
  lb: "alb",
  actor: "generic",
  service: "generic",
};

const AWS_ICON: Record<string, Icon> = {
  datastore: "rds",
  cache: "redis",
  queue: "sqs",
  bucket: "s3",
  gateway: "apigw",
  lb: "alb",
  service: "generic",
};

const KIND_SHAPE: Partial<Record<NodeKind, Shape>> = {
  datastore: "cylinder",
  cache: "cylinder",
  queue: "queue",
  actor: "actor",
  bucket: "rectangle",
};

function bumpSize(size: "sm" | "md" | "lg", dir: 1 | -1): "sm" | "md" | "lg" {
  const order = ["sm", "md", "lg"] as const;
  const i = Math.max(0, Math.min(2, order.indexOf(size) + dir));
  return order[i];
}

export function runPasses(scene: Scene): void {
  const passes = [...scene.passes];
  scene.passes = [];
  for (const pass of passes) runPass(scene, pass);
}

function runPass(scene: Scene, pass: Pass): void {
  switch (pass.type) {
    case "beautify":
      beautify(scene, pass.scope);
      break;
    case "convert-ink":
      convertInk(scene, pass.ids);
      break;
    case "tidy-layout":
      tidy(scene, pass.scope);
      break;
    case "unoverlap":
      unoverlap(scene, scopeNodeIds(scene, pass.scope));
      break;
    case "insert":
      insertOnPath(scene, pass);
      break;
    case "merge":
      mergeNodes(scene, pass);
      break;
    case "annotate-path":
      annotatePath(scene, pass.from, pass.to);
      break;
    case "restyle-icons":
      restyleIcons(scene);
      break;
  }
}

function beautify(scene: Scene, scope: "selection" | "board"): void {
  scene.board.style = "clean";
  const nodeIds =
    scope === "board"
      ? Object.keys(scene.nodes)
      : scene.selection.filter((id) => id in scene.nodes);
  const inkIds =
    scope === "board"
      ? Object.keys(scene.ink)
      : scene.selection.filter((id) => id in scene.ink);

  for (const id of nodeIds) {
    const node = scene.nodes[id];
    node.style = "clean";
    const shaped = KIND_SHAPE[node.kind];
    if (shaped) node.shape = shaped;
    if (!node.icon && KIND_ICON[node.kind]) node.icon = KIND_ICON[node.kind];
  }
  for (const id of Object.keys(scene.edges)) {
    if (scope === "selection") {
      const edge = scene.edges[id];
      const hit =
        nodeIds.includes(edge.from) ||
        nodeIds.includes(edge.to) ||
        scene.selection.includes(id);
      if (!hit) continue;
    }
    scene.edges[id].route = "ortho";
    if (scene.edges[id].kind === "async") scene.edges[id].stroke = "dashed";
  }
  for (const id of inkIds) {
    if (scene.ink[id].convert == null) scene.ink[id].convert = "auto";
  }
  convertInk(scene, inkIds);
}

function convertShape(convert: InkConvert | "auto", box: { w: number; h: number }): Shape {
  if (convert === "ellipse") return "ellipse";
  if (convert === "diamond") return "diamond";
  if (convert === "cylinder") return "cylinder";
  if (convert === "queue") return "queue";
  if (convert === "auto") {
    const ratio = box.w / box.h;
    if (ratio > 0.85 && ratio < 1.15) return "ellipse";
    return "rectangle";
  }
  return "rectangle";
}

function convertInk(scene: Scene, ids?: string[]): void {
  const list = ids ?? Object.keys(scene.ink).filter((id) => scene.ink[id].convert);
  for (const id of list) {
    const ink = scene.ink[id];
    if (!ink?.convert) continue;
    const bbox = inkBBox(ink);
    if (ink.convert === "line") {
      const selectedNodes = scene.selection.filter((s) => s in scene.nodes);
      if (selectedNodes.length === 2) {
        const edgeId = isSceneId(id) && !idTaken(scene, id) ? id : nextId(scene, "e_");
        scene.edges[edgeId] = {
          from: selectedNodes[0],
          to: selectedNodes[1],
          label: "",
          kind: "sync",
          stroke: "solid",
          route: "straight",
          exposure: null,
        };
      }
      delete scene.ink[id];
      continue;
    }
    if (ink.convert === "group") {
      const gid = isSceneId(id) && !(id in scene.groups) ? id : nextId(scene, "g_");
      const contains = spatialContains(scene, bbox);
      scene.groups[gid] = { label: "Group", contains, parent: null };
      delete scene.ink[id];
      if (scene.selection.includes(id)) {
        scene.selection = scene.selection.map((s) => (s === id ? gid : s));
      }
      continue;
    }
    const nid = !(id in scene.nodes) && isSceneId(id) ? id : nextId(scene, "n_");
    const shape = convertShape(ink.convert, bbox);
    const kind: NodeKind =
      shape === "cylinder" ? "datastore" : shape === "queue" ? "queue" : "unknown";
    scene.nodes[nid] = defaultNode({
      kind,
      shape,
      style: "clean",
      pin: { x: bbox.x, y: bbox.y },
      icon: KIND_ICON[kind] ?? null,
      label: kind === "unknown" ? "" : kind,
    });
    delete scene.ink[id];
    if (scene.selection.includes(id)) {
      scene.selection = scene.selection.map((s) => (s === id ? nid : s));
    }
    if (scene.lastDrawn === id) scene.lastDrawn = nid;
  }
}

function tidy(scene: Scene, scope: "board" | string): void {
  const ids = scopeNodeIds(scene, scope === "board" ? "board" : scope);
  for (const id of ids) {
    if (scene.nodes[id] && !scene.nodes[id].locked) {
      delete scene.nodes[id].pin;
    }
  }
  layoutUnpinned(scene, ids);
}

function insertOnPath(scene: Scene, pass: InsertPass): void {
  const edge = scene.edges[pass.on];
  if (!edge) throw new Error("unknown edge");
  if (pass.node in scene.nodes === false) {
    scene.nodes[pass.node] = defaultNode({
      kind: "unknown",
      label: pass.node,
      style: "clean",
    });
  }
  const from = edge.from;
  const to = edge.to;
  const oldId = pass.on;
  delete scene.edges[oldId];
  const left = nextId(scene, "e_");
  scene.edges[left] = { ...edge, from, to: pass.node };
  const right = nextId(scene, "e_");
  scene.edges[right] = { ...edge, from: pass.node, to, label: "" };
  const a = scene.nodes[from] ? nodeBox(scene.nodes[from]) : { x: 0, y: 0, w: 80, h: 40 };
  const b = scene.nodes[to] ? nodeBox(scene.nodes[to]) : { x: 200, y: 0, w: 80, h: 40 };
  const size = nodeSize(scene.nodes[pass.node]);
  scene.nodes[pass.node].pin = {
    x: (a.x + a.w / 2 + b.x + b.w / 2) / 2 - size.w / 2,
    y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 - size.h / 2,
  };
}

function mergeNodes(scene: Scene, pass: MergePass): void {
  const keep = scene.nodes[pass.keep];
  if (!keep) throw new Error("keep missing");
  const others = pass.ids.filter((id) => id !== pass.keep && scene.nodes[id]);
  const boxes = pass.ids.filter((id) => scene.nodes[id]).map((id) => nodeBox(scene.nodes[id]));
  if (boxes.length) {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    keep.pin = { x: minX, y: minY };
  }
  for (const [eid, edge] of Object.entries(scene.edges)) {
    if (others.includes(edge.from)) edge.from = pass.keep;
    if (others.includes(edge.to)) edge.to = pass.keep;
    if (edge.from === edge.to) delete scene.edges[eid];
  }
  for (const group of Object.values(scene.groups)) {
    group.contains = [
      ...new Set(group.contains.map((id) => (others.includes(id) ? pass.keep : id))),
    ];
  }
  for (const id of others) delete scene.nodes[id];
  scene.selection = scene.selection
    .map((id) => (others.includes(id) ? pass.keep : id))
    .filter((id, i, all) => all.indexOf(id) === i);
}

function annotatePath(scene: Scene, from: string, to: string): void {
  const path = shortestPath(scene, from, to);
  if (!path) throw new Error("no path");
  path.forEach((eid, i) => {
    const edge = scene.edges[eid];
    if (edge) edge.label = String(i + 1);
  });
}

function shortestPath(scene: Scene, from: string, to: string): string[] | null {
  const adj = new Map<string, { to: string; eid: string }[]>();
  for (const [eid, edge] of Object.entries(scene.edges)) {
    const list = adj.get(edge.from) ?? [];
    list.push({ to: edge.to, eid });
    adj.set(edge.from, list);
  }
  const queue: { node: string; trail: string[] }[] = [{ node: from, trail: [] }];
  const seen = new Set([from]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.node === to) return cur.trail;
    for (const step of adj.get(cur.node) ?? []) {
      if (seen.has(step.to)) continue;
      seen.add(step.to);
      queue.push({ node: step.to, trail: [...cur.trail, step.eid] });
    }
  }
  return null;
}

function restyleIcons(scene: Scene): void {
  const table = scene.board.palette === "aws" ? AWS_ICON : KIND_ICON;
  for (const node of Object.values(scene.nodes)) {
    const icon = table[node.kind];
    if (icon) node.icon = icon;
    node.style = "clean";
  }
}

export { bumpSize };
