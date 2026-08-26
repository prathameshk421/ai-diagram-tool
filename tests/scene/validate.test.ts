import { describe, expect, it } from "vitest";
import { cloneJson } from "../../src/scene/clone";
import { defaultNode } from "../../src/scene/empty";
import { applyJsonPatch, AgentWriteError } from "../../src/scene/patch";
import { validateScene } from "../../src/scene/validate";
import { apiDbScene } from "./fixtures";

describe("arch-scene/v1 validation rejects", () => {
  it("rejects unknown icon, kind, and shape", () => {
    const scene = apiDbScene();
    scene.nodes.api.icon = "aws.lambda" as typeof scene.nodes.api.icon;
    expect(
      validateScene(scene).some((e) => e.path.endsWith("/icon")),
    ).toBe(true);

    const kindScene = apiDbScene();
    kindScene.nodes.api.kind = "lambda" as typeof kindScene.nodes.api.kind;
    expect(
      validateScene(kindScene).some((e) => e.path.endsWith("/kind")),
    ).toBe(true);

    const shapeScene = apiDbScene();
    shapeScene.nodes.api.shape = "hexagon" as typeof shapeScene.nodes.api.shape;
    expect(
      validateScene(shapeScene).some((e) => e.path.endsWith("/shape")),
    ).toBe(true);
  });

  it("rejects dangling edge endpoints", () => {
    const scene = apiDbScene();
    scene.edges.bad = {
      from: "missing",
      to: "api",
      label: "",
      kind: "sync",
      stroke: "solid",
      route: "straight",
      exposure: null,
    };
    expect(validateScene(scene).some((e) => e.message.includes("dangling"))).toBe(
      true,
    );
  });

  it("rejects width/height and x/y outside pin in the stored scene", () => {
    const scene = apiDbScene() as unknown as {
      nodes: Record<string, Record<string, unknown>>;
    };
    scene.nodes.api.width = 99;
    const errors = validateScene(scene as never);
    expect(errors.some((e) => e.path.includes("width"))).toBe(true);
  });

  it("rejects beautify when freeze flags are explicitly false", () => {
    const scene = apiDbScene();
    scene.passes = [
      {
        type: "beautify",
        scope: "board",
        freezePins: false,
      },
    ];
    expect(
      validateScene(scene).some((e) => e.path.includes("beautify")),
    ).toBe(true);
  });

  it("accepts beautify with implied freezes (flags omitted)", () => {
    const scene = apiDbScene();
    scene.passes = [{ type: "beautify", scope: "board" }];
    expect(validateScene(scene).filter((e) => e.path.includes("beautify"))).toEqual(
      [],
    );
  });

  it("rejects group id that collides with a node id", () => {
    const scene = apiDbScene();
    scene.groups.api = { label: "API", contains: ["db"], parent: null };
    expect(
      validateScene(scene).some((e) => e.message.includes("collides")),
    ).toBe(true);
  });
});

describe("agent patch forbidden writes", () => {
  it("rejects agent-authored pin.x / pin.y", () => {
    const scene = apiDbScene();
    expect(() =>
      applyJsonPatch(scene, [
        { op: "replace", path: "/nodes/api/pin/x", value: 9 },
      ]),
    ).toThrow(AgentWriteError);
    expect(() =>
      applyJsonPatch(scene, [
        {
          op: "replace",
          path: "/nodes/api/pin",
          value: { x: 9, y: 9 },
        },
      ]),
    ).toThrow(AgentWriteError);
  });

  it("rejects width, height, and ink points in a patch", () => {
    const scene = apiDbScene();
    expect(() =>
      applyJsonPatch(scene, [
        { op: "add", path: "/nodes/api/width", value: 10 },
      ]),
    ).toThrow(AgentWriteError);
    scene.ink.stroke_1 = { convert: null, points: [[0, 0]] };
    expect(() =>
      applyJsonPatch(scene, [
        { op: "replace", path: "/ink/stroke_1/points", value: [[1, 1]] },
      ]),
    ).toThrow(AgentWriteError);
  });

  it("allows deleting a pin (unpin) and adding a node without coordinates", () => {
    const scene = apiDbScene();
    const unpinned = applyJsonPatch(scene, [
      { op: "remove", path: "/nodes/api/pin" },
    ]);
    expect(unpinned.nodes.api.pin).toBeUndefined();
    const withRedis = applyJsonPatch(unpinned, [
      {
        op: "add",
        path: "/nodes/redis",
        value: defaultNode({
          kind: "cache",
          label: "Redis",
          icon: "redis",
          shape: "cylinder",
        }),
      },
    ]);
    expect(withRedis.nodes.redis.kind).toBe("cache");
    expect(withRedis.nodes.redis.pin).toBeUndefined();
  });

  it("does not mutate the original scene", () => {
    const scene = apiDbScene();
    const copy = cloneJson(scene);
    applyJsonPatch(scene, [{ op: "replace", path: "/nodes/api/label", value: "X" }]);
    expect(scene).toEqual(copy);
  });
});
