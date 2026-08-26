import { describe, expect, it, vi } from "vitest";
import { runPipeline } from "../../src/agent/pipeline/orchestrator";
import type {
  EnhancerOutput,
  JudgeOutput,
  PipelineDeps,
} from "../../src/agent/pipeline/session";
import { TURN_CAPS } from "../../src/agent/pipeline/budgets";
import type { Command } from "../../src/intent/types";
import { FLASH_MODEL, UNKNOWN_SAY } from "../../src/intent/types";
import { sceneHash } from "../../src/scene/hash";
import type { Settings } from "../../src/settings/store";
import { apiDbScene, twoKafkaScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: FLASH_MODEL,
};

const alignLeft: Command = {
  op: "align",
  args: { edge: "left" },
  confidence: 0.9,
  say: "Aligned left.",
};

const readyAlign: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "align left",
  targetQueries: [],
  command: alignLeft,
};

const readyBare: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "align left",
  targetQueries: [],
};

function unusedRequestCommand(): PipelineDeps["requestCommand"] {
  return vi.fn(async () => {
    throw new Error("requestCommand should not be called");
  });
}

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    enhance: async () => readyAlign,
    judge: async () => ({ route: "command", reason: "default" }),
    requestCommand: unusedRequestCommand(),
    ...overrides,
  };
}

describe("runPipeline host channels", () => {
  it("keeps SHA stable for a question and does not call enhance", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const enhance = vi.fn(async () => readyBare);
    const result = await runPipeline(
      {
        transcript: "what is the single point of failure?",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({ enhance }),
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.answer).toBeTruthy();
    expect(result.llmCalls).toBe(0);
    expect(enhance).not.toHaveBeenCalled();
  });

  it("refuses a whole-board generate paragraph with zero LLM calls and no write", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const enhance = vi.fn(async () => readyBare);
    const result = await runPipeline(
      {
        transcript:
          "Build an AI RAG pipeline architecture with users, an API gateway, an embedder, a vector database, and an LLM.",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({ enhance }),
    );
    expect(result.llmCalls).toBe(0);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(enhance).not.toHaveBeenCalled();
  });
});

describe("runPipeline command path", () => {
  it("aligns left from enhance.command without requestCommand, llmCalls ≤ 2", async () => {
    const scene = apiDbScene();
    scene.selection = ["api", "db"];
    const before = sceneHash(scene);
    const requestCommand = unusedRequestCommand();
    const result = await runPipeline(
      {
        transcript: "align left",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({ requestCommand }),
    );
    expect(result.wrote).toBe(true);
    expect(sceneHash(result.scene)).not.toBe(before);
    expect(result.llmCalls).toBeLessThanOrEqual(TURN_CAPS.maxLlmCallsSimple);
    expect(result.llmCalls).toBeLessThanOrEqual(2);
    expect(requestCommand).not.toHaveBeenCalled();
    expect(result.scene.nodes.api.pin?.x).toBe(result.scene.nodes.db.pin?.x);
  });
});

describe("runPipeline ask / pending", () => {
  it("returns pending on enhance ask without writing", async () => {
    const scene = twoKafkaScene();
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "align the kafka",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => ({
          status: "ask",
          kind: "selection",
          say: "Which Kafka?",
          candidates: ["kafka_a", "kafka_b"],
        }),
      }),
    );
    expect(result.wrote).toBe(false);
    expect(result.ask).toBe(true);
    expect(result.pending).not.toBeNull();
    expect(result.pending?.candidates).toEqual(["kafka_a", "kafka_b"]);
    expect(result.pending?.sceneHashAtAsk).toBe(before);
    expect(sceneHash(result.scene)).toBe(before);
  });

  it("binds followUpTo to pending.id on the second run", async () => {
    const scene = twoKafkaScene();
    const enhance = vi
      .fn<PipelineDeps["enhance"]>()
      .mockResolvedValueOnce({
        status: "ask",
        kind: "selection",
        say: "Which Kafka?",
        candidates: ["kafka_a", "kafka_b"],
      })
      .mockResolvedValueOnce(readyAlign);

    const first = await runPipeline(
      {
        transcript: "align the kafka",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({ enhance }),
    );
    expect(first.pending).not.toBeNull();
    const pending = first.pending!;

    scene.selection = ["kafka_a", "worker"];
    await runPipeline(
      {
        transcript: "the left one",
        scene,
        settings: keyed,
        pending,
      },
      deps({ enhance }),
    );

    expect(enhance).toHaveBeenCalledTimes(2);
    expect(enhance.mock.calls[0][0].followUpTo).toBeNull();
    expect(enhance.mock.calls[1][0].followUpTo).toBe(pending.id);
  });
});

describe("runPipeline failure gates", () => {
  it("does not write when requestCommand throws after judge", async () => {
    const scene = apiDbScene();
    scene.selection = ["api", "db"];
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "align left",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyBare,
        judge: async () => ({ route: "command", reason: "llm" } satisfies JudgeOutput),
        requestCommand: async () => {
          throw new Error("500");
        },
      }),
    );
    expect(result.wrote).toBe(false);
    expect(result.scene).toBe(scene);
    expect(sceneHash(result.scene)).toBe(before);
  });

  it("cancels with no write when liveHash differs from startHash", async () => {
    const scene = apiDbScene();
    scene.selection = ["api", "db"];
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "align left",
        scene,
        settings: keyed,
        pending: null,
        liveHash: "ffffffff",
      },
      deps({ enhance: async () => readyAlign }),
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say).toMatch(/board changed/i);
  });

  it("does not write when the abort signal is already aborted", async () => {
    const scene = apiDbScene();
    scene.selection = ["api", "db"];
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "align left",
        scene,
        settings: keyed,
        pending: null,
        signal: AbortSignal.abort(),
      },
      deps({ enhance: async () => readyAlign }),
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
  });

  it("returns unknown and no write when judge routes build without a build dep", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "add redis in front of the db",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => ({
          status: "ready",
          summary: "insert redis",
          targetQueries: ["db"],
        }),
        judge: async () => ({ route: "build", reason: "structural" }),
      }),
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say).toMatch(/didn.?t catch|unknown|can.?t|cannot/i);
    expect(result.say === UNKNOWN_SAY || /unknown|catch/i.test(result.say)).toBe(
      true,
    );
  });
});
