import { describe, expect, it } from "vitest";
import { projectForAgent, projectForAgentSafe } from "../../src/scene/project";
import { apiDbScene, inkStrokeScene } from "../scene/fixtures";

function jsonKeys(value: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) jsonKeys(item, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      acc.add(key);
      jsonKeys(nested, acc);
    }
  }
  return acc;
}

describe("projectForAgentSafe", () => {
  it("strips pin and ink points; keeps view.rel, labels, kinds, icons, selection, lastDrawn", () => {
    const scene = apiDbScene();
    scene.selection = ["api"];
    scene.lastDrawn = "api";
    scene.groups.backend = {
      label: "Backend",
      contains: ["api", "db"],
      parent: null,
    };

    const projected = projectForAgentSafe(scene);
    const keys = jsonKeys(projected);
    expect(keys.has("pin")).toBe(false);
    expect(keys.has("points")).toBe(false);
    expect(JSON.stringify(projected)).not.toMatch(/"pin"/);
    expect(JSON.stringify(projected)).not.toMatch(/"points"/);

    const rec = projected as {
      nodes: Record<
        string,
        { label: string; kind: string; icon: unknown; pin?: unknown }
      >;
      edges: Record<string, unknown>;
      groups: Record<string, unknown>;
      selection: string[];
      lastDrawn: string | null;
      view: { rel: Record<string, string[]>; containsSpatial: unknown };
    };

    expect(rec.nodes.api.label).toBe("API");
    expect(rec.nodes.api.kind).toBe("service");
    expect(rec.nodes.db.icon).toBe("postgres");
    expect(rec.edges.api_to_db).toBeDefined();
    expect(rec.groups.backend).toBeDefined();
    expect(rec.selection).toEqual(["api"]);
    expect(rec.lastDrawn).toBe("api");
    expect(rec.view.containsSpatial).toBeDefined();

    const apiRel = rec.view.rel.api ?? [];
    const dbRel = rec.view.rel.db ?? [];
    const relates =
      apiRel.some((r) => /^(left_of|right_of):db$/.test(r)) ||
      dbRel.some((r) => /^(left_of|right_of):api$/.test(r));
    expect(relates).toBe(true);

    expect(scene.nodes.api.pin).toEqual({ x: 80, y: 120 });
    expect(scene.nodes.db.pin).toEqual({ x: 320, y: 120 });
  });

  it("strips ink.points from inkStrokeScene while keeping selection and lastDrawn", () => {
    const scene = inkStrokeScene();
    const projected = projectForAgentSafe(scene);
    const keys = jsonKeys(projected);
    expect(keys.has("pin")).toBe(false);
    expect(keys.has("points")).toBe(false);
    expect(JSON.stringify(projected)).not.toMatch(/"points"/);

    const rec = projected as {
      selection: string[];
      lastDrawn: string | null;
      ink: Record<string, { points?: unknown }>;
    };
    expect(rec.selection).toEqual(["stroke_1"]);
    expect(rec.lastDrawn).toBe("stroke_1");
    expect(rec.ink.stroke_1.points).toBeUndefined();
    expect(scene.ink.stroke_1.points?.length).toBeGreaterThan(0);
  });

  it("differs from projectForAgent: UI copy still includes pin", () => {
    const scene = apiDbScene();
    const ui = projectForAgent(scene) as {
      nodes: Record<string, { pin?: { x: number; y: number } }>;
    };
    const safe = projectForAgentSafe(scene) as {
      nodes: Record<string, { pin?: { x: number; y: number } }>;
    };
    expect(ui.nodes.api.pin).toEqual({ x: 80, y: 120 });
    expect(safe.nodes.api.pin).toBeUndefined();
    expect(jsonKeys(safe).has("pin")).toBe(false);
    expect(jsonKeys(ui).has("pin")).toBe(true);
  });
});
