import { describe, expect, it } from "vitest";
import { deleteAndRetarget } from "../../src/scene/structure";
import { validateScene } from "../../src/scene/validate";
import { mysqlAuroraScene, apiDbScene } from "./fixtures";

describe("delete + retarget", () => {
  it("rewrites edges onto the replacement and drops the deleted node", () => {
    const scene = mysqlAuroraScene();
    const next = deleteAndRetarget(scene, "mysql", "aurora");
    expect(next.nodes.mysql).toBeUndefined();
    expect(next.nodes.aurora).toBeDefined();
    expect(next.edges.api_to_mysql.from).toBe("api");
    expect(next.edges.api_to_mysql.to).toBe("aurora");
    expect(validateScene(next)).toEqual([]);
    expect(
      Object.values(next.edges).some((e) => e.from === "mysql" || e.to === "mysql"),
    ).toBe(false);
  });

  it("refuses a dangling retarget", () => {
    const scene = apiDbScene();
    expect(() => deleteAndRetarget(scene, "db", "aurora")).toThrow(/retarget/);
  });
});
