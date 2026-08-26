import { describe, expect, it } from "vitest";
import { envOmnirouteModel } from "../../src/intent/model";

describe("envOmnirouteModel", () => {
  it("reads OMNIROUTE_MODEL from process.env and trims it", () => {
    const previous = process.env.OMNIROUTE_MODEL;
    process.env.OMNIROUTE_MODEL = "  provider/model-id  ";
    expect(envOmnirouteModel()).toBe("provider/model-id");
    if (previous === undefined) delete process.env.OMNIROUTE_MODEL;
    else process.env.OMNIROUTE_MODEL = previous;
  });
});
