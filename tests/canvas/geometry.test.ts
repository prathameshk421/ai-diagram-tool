import { describe, expect, it } from "vitest";
import { edgePath, sizeTokenFromDrag } from "../../src/canvas/geometry";

describe("board geometry", () => {
  it("builds a straight segment and an ortho elbow", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 40, y: 20, w: 10, h: 10 };
    expect(edgePath(a, b, "straight")).toContain("L");
    expect(edgePath(a, b, "ortho").split("L").length).toBeGreaterThan(2);
  });

  it("maps drag size to sm|md|lg tokens, not pixel width", () => {
    expect(sizeTokenFromDrag(80, 40)).toBe("sm");
    expect(sizeTokenFromDrag(140, 80)).toBe("md");
    expect(sizeTokenFromDrag(240, 80)).toBe("lg");
  });
});
