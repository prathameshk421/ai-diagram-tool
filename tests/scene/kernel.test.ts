import { describe, expect, it } from "vitest";
import { cloneJson } from "../../src/scene/clone";
import { applyInsertRedisInFront } from "../../src/scene/commandAdapter";
import { compile } from "../../src/scene/kernel";
import { sceneHash } from "../../src/scene/hash";
import { apiDbScene, inkStrokeScene, threeBoxScene } from "./fixtures";

describe("beautify", () => {
  it("restyles the selection in place and freezes pins", () => {
    const scene = apiDbScene();
    scene.selection = ["api"];
    const pin = { ...scene.nodes.api.pin! };
    const dbStyle = scene.nodes.db.style;
    scene.passes = [{ type: "beautify", scope: "selection" }];
    compile(scene);
    expect(scene.nodes.api.style).toBe("clean");
    expect(scene.nodes.api.pin).toEqual(pin);
    expect(scene.nodes.db.style).toBe(dbStyle);
    expect(scene.board.style).toBe("clean");
    expect(scene.passes).toEqual([]);
  });

  it("does not add or remove nodes or edges (freeze topology)", () => {
    const scene = apiDbScene();
    const nodeIds = Object.keys(scene.nodes).sort();
    const edgeIds = Object.keys(scene.edges).sort();
    scene.passes = [{ type: "beautify", scope: "board" }];
    compile(scene);
    expect(Object.keys(scene.nodes).sort()).toEqual(nodeIds);
    expect(Object.keys(scene.edges).sort()).toEqual(edgeIds);
    expect(scene.nodes.api.kind).toBe("service");
    expect(scene.nodes.db.label).toBe("Postgres");
  });
});

describe("convert-ink", () => {
  it("promotes ink to a node with the same id and drops points", () => {
    const scene = inkStrokeScene();
    scene.passes = [{ type: "convert-ink", ids: ["stroke_1"] }];
    compile(scene);
    expect(scene.nodes.stroke_1).toBeDefined();
    expect(scene.ink.stroke_1).toBeUndefined();
    expect(scene.nodes.stroke_1.pin).toBeDefined();
    expect(scene.selection).toContain("stroke_1");
  });
});

describe("insert on path", () => {
  it("splices A→B into A→node→B and does not leave a sidecar A→B", () => {
    const scene = apiDbScene();
    const next = applyInsertRedisInFront(scene, "db");
    expect(next.edges.api_to_db).toBeUndefined();
    const hops = Object.values(next.edges);
    expect(hops.some((e) => e.from === "api" && e.to === "db")).toBe(false);
    expect(hops.some((e) => e.from === "api" && e.to === "redis")).toBe(true);
    expect(hops.some((e) => e.from === "redis" && e.to === "db")).toBe(true);
    expect(next.nodes.redis.kind).toBe("cache");
    expect(next.nodes.redis.pin).toBeDefined();
  });
});

describe("restyle-icons", () => {
  it("maps existing kinds to AWS icons and freezes pins", () => {
    const scene = apiDbScene();
    scene.board.palette = "aws";
    const pin = { ...scene.nodes.db.pin! };
    scene.passes = [{ type: "restyle-icons" }];
    compile(scene);
    expect(scene.nodes.db.icon).toBe("rds");
    expect(scene.nodes.db.pin).toEqual(pin);
    expect(scene.nodes.api.pin).toEqual({ x: 80, y: 120 });
  });
});

describe("tidy-layout", () => {
  it("does not mint dummy/ELK nodes and does not move locked pins", () => {
    const scene = apiDbScene();
    scene.nodes.api.locked = true;
    const apiPin = { ...scene.nodes.api.pin! };
    delete scene.nodes.db.pin;
    const before = Object.keys(scene.nodes).sort();
    scene.passes = [{ type: "tidy-layout", scope: "board" }];
    compile(scene);
    expect(Object.keys(scene.nodes).sort()).toEqual(before);
    expect(scene.nodes.api.pin).toEqual(apiPin);
    expect(scene.nodes.db.pin).toBeDefined();
    expect(sceneHash(scene).length).toBe(8);
  });
});

describe("merge", () => {
  it("keeps one id, retargets edges, deletes the others", () => {
    const scene = apiDbScene();
    scene.nodes.api2 = cloneJson(scene.nodes.api);
    scene.nodes.api2.label = "API copy";
    scene.nodes.api2.pin = { x: 80, y: 240 };
    scene.edges.api2_to_db = {
      ...scene.edges.api_to_db,
      from: "api2",
    };
    scene.passes = [{ type: "merge", ids: ["api", "api2"], keep: "api" }];
    compile(scene);
    expect(scene.nodes.api2).toBeUndefined();
    expect(scene.nodes.api).toBeDefined();
    expect(Object.values(scene.edges).every((e) => e.from !== "api2")).toBe(
      true,
    );
  });
});

describe("constraints: distribute even gaps", () => {
  it("spaces even gaps, not centers", () => {
    const scene = threeBoxScene();
    scene.constraints = [{ op: "distribute", axis: "h" }];
    compile(scene);
    const ax = scene.nodes.a.pin!.x;
    const bx = scene.nodes.b.pin!.x;
    const cx = scene.nodes.c.pin!.x;
    const w = 160;
    const gap1 = bx - (ax + w);
    const gap2 = cx - (bx + w);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.5);
  });
});

describe("unoverlap", () => {
  it("separates overlapping boxes without adding nodes", () => {
    const scene = apiDbScene();
    scene.nodes.db.pin = { ...scene.nodes.api.pin! };
    scene.passes = [{ type: "unoverlap", scope: "board" }];
    const ids = Object.keys(scene.nodes);
    compile(scene);
    expect(Object.keys(scene.nodes)).toEqual(ids);
    expect(scene.nodes.db.pin).not.toEqual(scene.nodes.api.pin);
  });
});
