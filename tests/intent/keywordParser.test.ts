import { describe, expect, it } from "vitest";
import { keywordParser } from "../../src/intent/keywordParser";
import { BARE_ALIGN_SAY, BARE_DISTRIBUTE_SAY, type Command } from "../../src/intent/types";

function expectOp(
  text: string,
  op: Command["op"],
  args: Record<string, unknown>,
  confidence?: number,
) {
  const command = keywordParser(text);
  expect(command.op).toBe(op);
  expect(command.args).toEqual(args);
  if (confidence !== undefined) expect(command.confidence).toBe(confidence);
}

describe("keywordParser", () => {
  it("perfect this circle → ellipse", () => {
    expectOp("perfect this circle", "perfect", { shape: "ellipse" }, 0.8);
  });

  it("make this a circle → ellipse", () => {
    expectOp("make this a circle", "perfect", { shape: "ellipse" }, 0.8);
  });

  it("make this a rectangle", () => {
    expectOp("make this a rectangle", "perfect", { shape: "rectangle" }, 0.8);
  });

  it("make this a box", () => {
    expectOp("make this a box", "perfect", { shape: "rectangle" }, 0.8);
  });

  it("perfect this diamond", () => {
    expectOp("perfect this diamond", "perfect", { shape: "diamond" }, 0.8);
  });

  it("make this a line", () => {
    expectOp("make this a line", "perfect", { shape: "line" }, 0.8);
  });

  it("perfect this → auto", () => {
    expectOp("perfect this", "perfect", { shape: "auto" }, 0.8);
  });

  it("clean this up → auto", () => {
    expectOp("clean this up", "perfect", { shape: "auto" }, 0.8);
  });

  it("align left", () => {
    expectOp("align left", "align", { edge: "left" }, 0.8);
  });

  it("left align", () => {
    expectOp("left align", "align", { edge: "left" }, 0.8);
  });

  it("align right", () => {
    expectOp("align right", "align", { edge: "right" }, 0.8);
  });

  it("align top", () => {
    expectOp("align top", "align", { edge: "top" }, 0.8);
  });

  it("align bottom", () => {
    expectOp("align bottom", "align", { edge: "bottom" }, 0.8);
  });

  it("center these horizontally", () => {
    expectOp("center these horizontally", "align", { edge: "centerH" }, 0.8);
  });

  it("center these vertically", () => {
    expectOp("center these vertically", "align", { edge: "centerV" }, 0.8);
  });

  it("bare align is unknown at 0.8 and skips LLM", () => {
    expectOp("align these", "unknown", {}, 0.8);
    expectOp("align", "unknown", {}, 0.8);
    expect(keywordParser("align these").say).toBe(BARE_ALIGN_SAY);
  });

  it("distribute vertically", () => {
    expectOp("distribute vertically", "distribute", { axis: "v" }, 0.8);
  });

  it("distribute horizontally has an axis", () => {
    expectOp("distribute horizontally", "distribute", { axis: "h" }, 0.8);
  });

  it("bare distribute / space evenly do not invent h", () => {
    expectOp("distribute", "unknown", {}, 0.8);
    expectOp("space these evenly", "unknown", {}, 0.8);
    expect(keywordParser("space these evenly").say).toBe(BARE_DISTRIBUTE_SAY);
  });

  it("snap", () => {
    expectOp("snap to grid", "snap", {}, 0.8);
  });

  it("same width / height / size", () => {
    expectOp("same width", "equalize", { dim: "width" }, 0.8);
    expectOp("same height", "equalize", { dim: "height" }, 0.8);
    expectOp("same size", "equalize", { dim: "both" }, 0.8);
    expectOp("equalize", "equalize", { dim: "both" }, 0.8);
  });

  it("bigger / smaller", () => {
    expectOp("make this bigger", "bigger", {}, 0.8);
    expectOp("smaller", "smaller", {}, 0.8);
  });

  it("connect", () => {
    expectOp("connect these", "connect", {}, 0.8);
  });

  it("rotate", () => {
    expectOp("rotate", "rotate", { degrees: 90 }, 0.8);
    expectOp("rotate 90", "rotate", { degrees: 90 }, 0.8);
  });

  it("ALIGN LEFT!!!", () => {
    expectOp("ALIGN LEFT!!!", "align", { edge: "left" }, 0.8);
  });

  it("please perfectly this → perfect auto", () => {
    expectOp("please perfectly this", "perfect", { shape: "auto" }, 0.8);
  });

  it("draw me aws → unknown confidence 0", () => {
    expectOp("draw me aws", "unknown", {}, 0);
  });
});
