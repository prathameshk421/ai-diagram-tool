import { describe, expect, it } from "vitest";
import {
  BARE_ALIGN_SAY,
  FLASH_MODEL,
  PRO_MODEL,
  isCommand,
  parseCommandJson,
} from "../../src/intent/types";
import { SYSTEM_PROMPT } from "../../src/intent/systemPrompt";

describe("model ids", () => {
  it("freezes OpenCode Go DeepSeek ids", () => {
    expect(FLASH_MODEL).toBe("opencode-go/deepseek-v4-flash");
    expect(PRO_MODEL).toBe("opencode-go/deepseek-v4-pro");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("requires json and forbids coordinates", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("json");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("never invent coordinates");
    expect(SYSTEM_PROMPT).toContain('"edge":"left"');
  });
});

describe("isCommand", () => {
  const base = {
    op: "align",
    args: { edge: "left" },
    confidence: 0.9,
    say: "Aligned left.",
  };

  it("accepts a valid align and drops extra non-coordinate args", () => {
    expect(isCommand({ ...base, args: { edge: "left", extra: 1 } })).toEqual({
      op: "align",
      args: { edge: "left" },
      confidence: 0.9,
      say: "Aligned left.",
    });
  });

  it("rejects coordinate keys at the top level and in args", () => {
    expect(isCommand({ ...base, x: 1 })).toBeNull();
    expect(isCommand({ ...base, args: { edge: "left", y: 2 } })).toBeNull();
    expect(isCommand({ ...base, args: { edge: "left", width: 10 } })).toBeNull();
    expect(isCommand({ ...base, args: { edge: "left", points: [] } })).toBeNull();
    expect(isCommand({ ...base, args: { edge: "left", cx: 0, cy: 0 } })).toBeNull();
  });

  it("rejects invalid edge, degrees other than 90, missing say", () => {
    expect(isCommand({ ...base, args: { edge: "middle" } })).toBeNull();
    expect(
      isCommand({ op: "rotate", args: { degrees: 45 }, confidence: 1, say: "x" }),
    ).toBeNull();
    expect(isCommand({ ...base, say: 1 })).toBeNull();
  });

  it("accepts confidence 0.45 (boundary); caller may still refuse below that", () => {
    expect(isCommand({ ...base, confidence: 0.45 })).not.toBeNull();
    expect(isCommand({ ...base, confidence: -0.1 })).toBeNull();
  });

  it("parseCommandJson strips fences", () => {
    expect(
      parseCommandJson("```json\n" + JSON.stringify(base) + "\n```"),
    ).toEqual(base);
  });
});

describe("bare-align copy", () => {
  it("is a distinct hint", () => {
    expect(BARE_ALIGN_SAY).toMatch(/align left/);
  });
});
