import { describe, expect, it } from "vitest";
import { commitDrawnBox, commitLabel, commitPenStroke } from "../../src/canvas/drawOps";
import { emptyScene } from "../../src/scene/empty";
import { SceneHistory } from "../../src/scene/history";
import { apiDbScene } from "../scene/fixtures";

describe("commitDrawnBox", () => {
  it("ignores a tiny drag and does not mint a node", () => {
    const scene = emptyScene();
    expect(commitDrawnBox(scene, 10, 10, 12, 12)).toBeNull();
    expect(scene.nodes).toEqual({});
  });

  it("mints n_1 with a pin and size token from a real drag", () => {
    const scene = apiDbScene();
    const next = commitDrawnBox(scene, 10, 20, 140, 100);
    expect(next).not.toBeNull();
    expect(next!.nodes.n_1).toBeDefined();
    expect(next!.nodes.n_1.pin).toEqual({ x: 10, y: 20 });
    expect(next!.nodes.n_1.size).toBe("md");
    expect(next!.lastDrawn).toBe("n_1");
    expect(scene.nodes.n_1).toBeUndefined();
  });
});

describe("commitPenStroke", () => {
  it("stores points on a new ink id", () => {
    const scene = emptyScene();
    const next = commitPenStroke(scene, [
      [0, 0],
      [8, 8],
      [20, 4],
    ]);
    expect(next!.ink.stroke_1.points?.length).toBe(3);
    expect(next!.lastDrawn).toBe("stroke_1");
  });
});

describe("commitLabel", () => {
  it("renames a node without touching pins", () => {
    const scene = apiDbScene();
    const pin = { ...scene.nodes.api.pin! };
    const next = commitLabel(scene, "api", "Orchestrator");
    expect(next.nodes.api.label).toBe("Orchestrator");
    expect(next.nodes.api.pin).toEqual(pin);
    expect(scene.nodes.api.label).toBe("API");
  });
});

describe("board history snapshots", () => {
  it("undo restores the scene captured before a commit", () => {
    const history = new SceneHistory();
    const before = apiDbScene();
    history.snapshot(before);
    const after = commitDrawnBox(before, 10, 20, 140, 100)!;
    const undone = history.undo(after);
    expect(undone.nodes.n_1).toBeUndefined();
    expect(undone.nodes.api).toBeDefined();
  });
});
