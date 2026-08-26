import { SCHEMA_ID, type Scene, type SceneNode } from "./types";

export function defaultNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    kind: "unknown",
    label: "",
    icon: null,
    shape: "rectangle",
    size: "md",
    style: "sketch",
    locked: false,
    rotation: 0,
    ...overrides,
  };
}

export function emptyScene(): Scene {
  return {
    schema: SCHEMA_ID,
    board: {
      grid: 8,
      flow: "left-to-right",
      palette: "architecture",
      style: "sketch",
      legend: false,
    },
    selection: [],
    lastDrawn: null,
    nodes: {},
    edges: {},
    groups: {},
    ink: {},
    passes: [],
    constraints: [],
    meta: { strict: false },
  };
}

/** Starter board so voice commands have a referent. First visit only. */
export function demoScene(): Scene {
  const scene = emptyScene();
  scene.nodes.users = defaultNode({
    kind: "actor",
    label: "Users",
    shape: "actor",
    pin: { x: 40, y: 120 },
    style: "sketch",
  });
  scene.nodes.api = defaultNode({
    kind: "service",
    label: "API",
    pin: { x: 220, y: 120 },
    style: "sketch",
  });
  scene.nodes.db = defaultNode({
    kind: "datastore",
    label: "Postgres",
    icon: "postgres",
    shape: "cylinder",
    pin: { x: 440, y: 112 },
    style: "sketch",
  });
  scene.edges.users_to_api = {
    from: "users",
    to: "api",
    label: "",
    kind: "sync",
    stroke: "solid",
    route: "straight",
    exposure: "internet",
  };
  scene.edges.api_to_db = {
    from: "api",
    to: "db",
    label: "reads",
    kind: "sync",
    stroke: "solid",
    route: "straight",
    exposure: null,
  };
  return scene;
}
