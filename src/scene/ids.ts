import { ID_PATTERN, type Scene } from "./types";

export function isSceneId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function nextId(scene: Scene, prefix: string): string {
  let n = 1;
  while (idTaken(scene, `${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function idTaken(scene: Scene, id: string): boolean {
  return (
    id in scene.nodes ||
    id in scene.edges ||
    id in scene.groups ||
    id in scene.ink
  );
}
