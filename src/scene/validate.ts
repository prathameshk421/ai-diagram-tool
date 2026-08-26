import { boxesOverlap, groupBox, inkBBox, nodeBox } from "./boxes";
import {
  EDGE_KINDS,
  EXPOSURES,
  FLOWS,
  FORBIDDEN_WRITE_KEYS,
  ICONS,
  ID_PATTERN,
  INK_CONVERTS,
  NODE_KINDS,
  PALETTES,
  ROUTES,
  SCHEMA_ID,
  SHAPES,
  SIZES,
  STROKES,
  STYLES,
  type Pass,
  type Scene,
} from "./types";

export type ValidationError = { path: string; message: string };

const KIND_SET = new Set<string>(NODE_KINDS);
const SHAPE_SET = new Set<string>(SHAPES);
const SIZE_SET = new Set<string>(SIZES);
const STYLE_SET = new Set<string>(STYLES);
const ICON_SET = new Set<string>(ICONS);
const FLOW_SET = new Set<string>(FLOWS);
const PALETTE_SET = new Set<string>(PALETTES);
const EDGE_KIND_SET = new Set<string>(EDGE_KINDS);
const STROKE_SET = new Set<string>(STROKES);
const ROUTE_SET = new Set<string>(ROUTES);
const EXPOSURE_SET = new Set<string>(EXPOSURES);
const CONVERT_SET = new Set<string>(INK_CONVERTS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function collectForbiddenKeys(
  value: unknown,
  path: string,
  into: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectForbiddenKeys(item, `${path}/${i}`, into));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}/${key}`;
    if (FORBIDDEN_WRITE_KEYS.has(key) && key !== "x" && key !== "y") {
      into.push(next);
    }
    if ((key === "x" || key === "y") && !path.endsWith("/pin")) {
      into.push(next);
    }
    collectForbiddenKeys(child, next, into);
  }
}

export function validateScene(scene: Scene): ValidationError[] {
  const errors: ValidationError[] = [];
  if (scene.schema !== SCHEMA_ID) {
    errors.push({ path: "/schema", message: `expected ${SCHEMA_ID}` });
  }
  if (!FLOW_SET.has(scene.board.flow)) {
    errors.push({ path: "/board/flow", message: "invalid flow" });
  }
  if (!PALETTE_SET.has(scene.board.palette)) {
    errors.push({ path: "/board/palette", message: "invalid palette" });
  }
  if (!STYLE_SET.has(scene.board.style)) {
    errors.push({ path: "/board/style", message: "invalid style" });
  }
  if (!(scene.board.grid > 0)) {
    errors.push({ path: "/board/grid", message: "grid must be > 0" });
  }

  const known =
    new Set([
      ...Object.keys(scene.nodes),
      ...Object.keys(scene.edges),
      ...Object.keys(scene.groups),
      ...Object.keys(scene.ink),
    ]);

  for (const id of Object.keys(scene.nodes)) {
    if (!ID_PATTERN.test(id)) {
      errors.push({ path: `/nodes/${id}`, message: "invalid id" });
    }
    const node = scene.nodes[id];
    if (!KIND_SET.has(node.kind)) {
      errors.push({ path: `/nodes/${id}/kind`, message: "unknown kind" });
    }
    if (!SHAPE_SET.has(node.shape)) {
      errors.push({ path: `/nodes/${id}/shape`, message: "unknown shape" });
    }
    if (!SIZE_SET.has(node.size)) {
      errors.push({ path: `/nodes/${id}/size`, message: "unknown size" });
    }
    if (!STYLE_SET.has(node.style)) {
      errors.push({ path: `/nodes/${id}/style`, message: "unknown style" });
    }
    if (node.icon !== null && !ICON_SET.has(node.icon)) {
      errors.push({ path: `/nodes/${id}/icon`, message: "unknown icon" });
    }
    if (node.rotation !== 0 && node.rotation !== 90) {
      errors.push({ path: `/nodes/${id}/rotation`, message: "rotation must be 0 or 90" });
    }
  }

  for (const [id, edge] of Object.entries(scene.edges)) {
    if (!ID_PATTERN.test(id)) {
      errors.push({ path: `/edges/${id}`, message: "invalid id" });
    }
    if (!(edge.from in scene.nodes) && !(edge.from in scene.groups)) {
      errors.push({ path: `/edges/${id}/from`, message: "dangling from" });
    }
    if (!(edge.to in scene.nodes) && !(edge.to in scene.groups)) {
      errors.push({ path: `/edges/${id}/to`, message: "dangling to" });
    }
    if (!EDGE_KIND_SET.has(edge.kind)) {
      errors.push({ path: `/edges/${id}/kind`, message: "invalid kind" });
    }
    if (!STROKE_SET.has(edge.stroke)) {
      errors.push({ path: `/edges/${id}/stroke`, message: "invalid stroke" });
    }
    if (!ROUTE_SET.has(edge.route)) {
      errors.push({ path: `/edges/${id}/route`, message: "invalid route" });
    }
    if (edge.exposure !== null && !EXPOSURE_SET.has(edge.exposure)) {
      errors.push({ path: `/edges/${id}/exposure`, message: "invalid exposure" });
    }
  }

  for (const [id, group] of Object.entries(scene.groups)) {
    if (!ID_PATTERN.test(id)) {
      errors.push({ path: `/groups/${id}`, message: "invalid id" });
    }
    if (id in scene.nodes) {
      errors.push({
        path: `/groups/${id}`,
        message: "group id collides with node id",
      });
    }
    if (group.parent && !(group.parent in scene.groups)) {
      errors.push({ path: `/groups/${id}/parent`, message: "unknown parent" });
    }
    for (const member of group.contains) {
      if (!(member in scene.nodes) && !(member in scene.groups)) {
        errors.push({
          path: `/groups/${id}/contains`,
          message: `unknown member ${member}`,
        });
      }
    }
  }

  for (const [id, ink] of Object.entries(scene.ink)) {
    if (!ID_PATTERN.test(id)) {
      errors.push({ path: `/ink/${id}`, message: "invalid id" });
    }
    if (ink.convert !== null && !CONVERT_SET.has(ink.convert)) {
      errors.push({ path: `/ink/${id}/convert`, message: "unknown convert" });
    }
  }

  for (const sel of scene.selection) {
    if (!known.has(sel)) {
      errors.push({ path: "/selection", message: `unknown id ${sel}` });
    }
  }
  if (scene.lastDrawn && !known.has(scene.lastDrawn)) {
    errors.push({ path: "/lastDrawn", message: "unknown id" });
  }

  for (const pass of scene.passes) {
    errors.push(...validatePass(scene, pass));
  }

  const illegal: string[] = [];
  collectStoredGeometry(scene, "", illegal);
  for (const path of illegal) {
    errors.push({ path, message: "illegal geometry key in stored scene" });
  }

  return errors;
}

function collectStoredGeometry(
  value: unknown,
  path: string,
  into: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectStoredGeometry(item, `${path}/${i}`, into),
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}/${key}`;
    if (key === "width" || key === "height" || key === "cx" || key === "cy") {
      into.push(next);
    }
    if ((key === "x" || key === "y") && !path.endsWith("/pin")) {
      into.push(next);
    }
    collectStoredGeometry(child, next, into);
  }
}

function validatePass(scene: Scene, pass: Pass): ValidationError[] {
  if (pass.type === "beautify") {
    if (
      pass.freezeTopology === false ||
      pass.freezeSemantics === false ||
      pass.freezePins === false
    ) {
      return [
        {
          path: "/passes/beautify",
          message:
            "beautify implies freezeTopology + freezeSemantics + freezePins",
        },
      ];
    }
  }
  if (pass.type === "insert") {
    if (!(pass.on in scene.edges)) {
      return [{ path: "/passes/insert/on", message: "unknown edge" }];
    }
    if (!ID_PATTERN.test(pass.node)) {
      return [{ path: "/passes/insert/node", message: "invalid node id" }];
    }
  }
  if (pass.type === "merge") {
    if (!pass.ids.includes(pass.keep)) {
      return [{ path: "/passes/merge/keep", message: "keep must be in ids" }];
    }
  }
  if (pass.type === "annotate-path") {
    if (!(pass.from in scene.nodes) || !(pass.to in scene.nodes)) {
      return [{ path: "/passes/annotate-path", message: "unknown endpoints" }];
    }
  }
  return [];
}

export function assertValid(scene: Scene): void {
  const errors = validateScene(scene);
  if (errors.length) {
    throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join("; "));
  }
}

export function overlapsExist(scene: Scene): boolean {
  const ids = Object.keys(scene.nodes);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (boxesOverlap(nodeBox(scene.nodes[ids[i]]), nodeBox(scene.nodes[ids[j]]))) {
        return true;
      }
    }
  }
  return false;
}

export function spatialContains(scene: Scene, hull: { x: number; y: number; w: number; h: number }): string[] {
  return Object.entries(scene.nodes)
    .filter(([, node]) => {
      const box = nodeBox(node);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return (
        cx >= hull.x &&
        cx <= hull.x + hull.w &&
        cy >= hull.y &&
        cy <= hull.y + hull.h
      );
    })
    .map(([id]) => id);
}

export function inkHull(scene: Scene, inkId: string) {
  return inkBBox(scene.ink[inkId]);
}

export function frameHull(scene: Scene, groupId: string) {
  return groupBox(scene, groupId);
}
