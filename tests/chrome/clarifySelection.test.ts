import { describe, expect, it } from "vitest";
import { canUseSelection } from "../../src/chrome/clarifySelection";

describe("canUseSelection", () => {
  it("is false when the board selection is empty (deictic ask cannot complete)", () => {
    expect(canUseSelection([])).toBe(false);
  });

  it("is true when the board has at least one selected id", () => {
    expect(canUseSelection(["api"])).toBe(true);
    expect(canUseSelection(["api", "db"])).toBe(true);
  });
});
