import { describe, expect, it } from "vitest";
import { resolveReferent } from "../../src/scene/referent";
import { twoKafkaScene, apiDbScene } from "./fixtures";

describe("referent resolution", () => {
  it("asks when two Kafkas match and the query does not disambiguate", () => {
    const scene = twoKafkaScene();
    const hit = resolveReferent(scene, "the kafka");
    expect(hit.status).toBe("ask");
  });

  it("picks the left Kafka when rel uniquely identifies it", () => {
    const scene = twoKafkaScene();
    const hit = resolveReferent(scene, "the kafka on the left");
    expect(hit).toEqual({ status: "unique", id: "kafka_a" });
  });

  it("asks when color is the only targeting cue", () => {
    const scene = twoKafkaScene();
    const hit = resolveReferent(scene, "the blue one");
    expect(hit.status).toBe("ask");
    if (hit.status === "ask") expect(hit.say).toMatch(/color/i);
  });

  it("resolves a unique label case-insensitively", () => {
    const scene = apiDbScene();
    expect(resolveReferent(scene, "postgres")).toEqual({
      status: "unique",
      id: "db",
    });
  });

  it("asks when two Kafkas tie on the requested side", () => {
    const scene = twoKafkaScene();
    scene.nodes.kafka_b.pin = { ...scene.nodes.kafka_a.pin! };
    scene.nodes.kafka_b.pin.y += 200;
    const hit = resolveReferent(scene, "the kafka on the left");
    expect(hit.status).toBe("ask");
  });
});
