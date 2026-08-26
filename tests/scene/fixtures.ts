import { defaultNode, emptyScene } from "../../src/scene/empty";
import type { Scene } from "../../src/scene/types";

export function apiDbScene(): Scene {
  const scene = emptyScene();
  scene.nodes.api = defaultNode({
    kind: "service",
    label: "API",
    pin: { x: 80, y: 120 },
    style: "sketch",
  });
  scene.nodes.db = defaultNode({
    kind: "datastore",
    label: "Postgres",
    icon: "postgres",
    shape: "cylinder",
    pin: { x: 320, y: 120 },
    style: "sketch",
  });
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

export function twoKafkaScene(): Scene {
  const scene = emptyScene();
  scene.nodes.kafka_a = defaultNode({
    kind: "queue",
    label: "Kafka",
    icon: "kafka",
    shape: "queue",
    pin: { x: 40, y: 80 },
  });
  scene.nodes.kafka_b = defaultNode({
    kind: "queue",
    label: "Kafka",
    icon: "kafka",
    shape: "queue",
    pin: { x: 400, y: 80 },
  });
  scene.nodes.worker = defaultNode({
    kind: "service",
    label: "Worker",
    pin: { x: 220, y: 240 },
  });
  return scene;
}

export function inkStrokeScene(): Scene {
  const scene = emptyScene();
  scene.ink.stroke_1 = {
    convert: "rectangle",
    points: [
      [20, 20],
      [140, 20],
      [140, 90],
      [20, 90],
    ],
  };
  scene.selection = ["stroke_1"];
  scene.lastDrawn = "stroke_1";
  return scene;
}

export function mysqlAuroraScene(): Scene {
  const scene = emptyScene();
  scene.nodes.api = defaultNode({
    kind: "service",
    label: "API",
    pin: { x: 40, y: 80 },
  });
  scene.nodes.mysql = defaultNode({
    kind: "datastore",
    label: "MySQL",
    icon: "database",
    shape: "cylinder",
    pin: { x: 240, y: 80 },
  });
  scene.nodes.aurora = defaultNode({
    kind: "datastore",
    label: "Aurora",
    icon: "rds",
    shape: "cylinder",
    pin: { x: 240, y: 220 },
  });
  scene.edges.api_to_mysql = {
    from: "api",
    to: "mysql",
    label: "",
    kind: "sync",
    stroke: "solid",
    route: "straight",
    exposure: null,
  };
  return scene;
}

export function threeBoxScene(): Scene {
  const scene = emptyScene();
  scene.nodes.a = defaultNode({ label: "A", pin: { x: 0, y: 40 }, size: "md" });
  scene.nodes.b = defaultNode({ label: "B", pin: { x: 40, y: 40 }, size: "md" });
  scene.nodes.c = defaultNode({ label: "C", pin: { x: 400, y: 40 }, size: "md" });
  scene.selection = ["a", "b", "c"];
  return scene;
}
