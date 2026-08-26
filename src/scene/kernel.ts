import { applyConstraints } from "./constraints";
import { layoutUnpinned } from "./layout";
import { runPasses } from "./passes";
import { assertValid } from "./validate";
import type { Scene } from "./types";

export function compile(scene: Scene): Scene {
  runPasses(scene);
  applyConstraints(scene);
  layoutUnpinned(scene);
  for (const edge of Object.values(scene.edges)) {
    if (edge.kind === "async") edge.stroke = "dashed";
  }
  assertValid(scene);
  return scene;
}
