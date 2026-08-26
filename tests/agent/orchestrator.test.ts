import { describe, expect, it, vi } from "vitest";
import type { EditToolCall } from "../../src/agent/edit";
import {
  runPipeline,
  sceneAfterPipeline,
} from "../../src/agent/pipeline/orchestrator";
import type {
  EnhancerOutput,
  JudgeOutput,
  PipelineDeps,
  PipelineOutput,
} from "../../src/agent/pipeline/session";
import { TURN_CAPS } from "../../src/agent/pipeline/budgets";
import { hasEdge, noEdge, verifyEdit } from "../../src/agent/verify/predicates";
import { UNKNOWN_SAY, type Command } from "../../src/intent/types";
import { cloneJson } from "../../src/scene/clone";
import { sceneHash } from "../../src/scene/hash";
import type { Settings } from "../../src/settings/store";
import { apiDbScene, twoKafkaScene } from "../scene/fixtures";

const keyed: Settings = {
  omnirouteUrl: "http://localhost:20128",
  omnirouteApiKey: "sk_test",
  groqApiKey: "",
  omnirouteModel: "test/model",
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

  it("deictic empty-selection command path yields ask and pending", async () => {
    const scene = apiDbScene();
    scene.selection = [];
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "perfect this",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => ({
          status: "ready",
          summary: "perfect this",
          targetQueries: [],
          command: {
            op: "perfect",
            args: { shape: "auto" },
            confidence: 0.9,
            say: "Cleaned up.",
          },
        }),
      }),
    );
    expect(result.wrote).toBe(false);
    expect(result.ask).toBe(true);
    expect(result.pending).not.toBeNull();
    expect(result.pending?.kind === "selection" || result.pending?.kind === "either").toBe(
      true,
    );
    expect(result.pending?.originalTranscript).toBe("perfect this");
    expect(result.pending?.sceneHashAtAsk).toBe(before);
    expect(sceneHash(result.scene)).toBe(before);
    // Empty candidates: completing the ask is App chrome (ClarifyPanel
    // "Use selection" → runText(originalTranscript) with board ids).
    // Orchestrator does not consume a use-selection event.
    expect(result.pending?.candidates).toEqual([]);
  });

  it("does not write on undo; App runText restores history, not the orchestrator", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const enhance = vi.fn(async () => readyBare);
    const result = await runPipeline(
      {
        transcript: "undo",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({ enhance }),
    );
    expect(result.wrote).toBe(false);
    expect(result.llmCalls).toBe(0);
    expect(result.pending).toBeNull();
    expect(sceneHash(result.scene)).toBe(before);
    expect(enhance).not.toHaveBeenCalled();
  });
});

describe("sceneAfterPipeline", () => {
  it("keeps the live board when the run did not write", () => {
    const start = apiDbScene();
    const live = cloneJson(start);
    live.nodes.api.label = "Gateway";
    const out: PipelineOutput = {
      scene: start,
      wrote: false,
      ask: false,
      pending: null,
      say: "Board changed — try again.",
      answer: null,
      command: null,
      trace: { stage: "idle" },
      llmCalls: 1,
    };
    expect(sceneAfterPipeline(live, out)).toBe(live);
    expect(sceneAfterPipeline(live, out).nodes.api.label).toBe("Gateway");
  });

  it("commits out.scene when the run wrote", () => {
    const start = apiDbScene();
    const live = cloneJson(start);
    live.nodes.api.label = "Human";
    const written = cloneJson(start);
    written.nodes.api.label = "Aligned";
    const out: PipelineOutput = {
      scene: written,
      wrote: true,
      ask: false,
      pending: null,
      say: "Aligned left.",
      answer: null,
      command: alignLeft,
      trace: { stage: "idle" },
      llmCalls: 1,
    };
    expect(sceneAfterPipeline(live, out)).toBe(written);
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

const redisInsertCalls: EditToolCall[] = [
  {
    tool: "add_node",
    args: {
      id: "redis",
      spec: { kind: "cache", label: "Redis", icon: "redis", shape: "cylinder" },
    },
  },
  { tool: "insert_on_path", args: { node: "redis", on: "api_to_db" } },
];

const readyInsert: Extract<EnhancerOutput, { status: "ready" }> = {
  status: "ready",
  summary: "insert redis",
  targetQueries: ["db"],
};

describe("runPipeline build verify loop", () => {
  it("retries build once when verify fails then passes", async () => {
    expect(TURN_CAPS.maxVerifyAttempts).toBe(2);
    const scene = apiDbScene();
    const verify = vi
      .fn<NonNullable<PipelineDeps["verify"]>>()
      .mockReturnValueOnce({
        pass: false,
        failures: [{ code: "INSERT_SIDECAR", detail: "sidecar" }],
        remediation: "rebuild",
      })
      .mockReturnValueOnce({ pass: true });
    const build = vi.fn<NonNullable<PipelineDeps["build"]>>(async () => ({
      calls: redisInsertCalls,
      say: "Inserted Redis.",
    }));
    const result = await runPipeline(
      {
        transcript: "add Redis in front of the DB",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "build", reason: "structural" }),
        build,
        verify,
      }),
    );
    expect(build).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1][0].errors).toEqual([
      { code: "INSERT_SIDECAR", detail: "sidecar" },
    ]);
    expect(result.wrote).toBe(true);
    expect(noEdge(result.scene, "api", "db")).toBe(true);
  });

  it("rolls back to the original scene after two failed verifies", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const build = vi.fn(async () => ({
      calls: redisInsertCalls,
      say: "Inserted Redis.",
    }));
    const verify = vi.fn(() => ({
      pass: false as const,
      failures: [{ code: "INSERT_SIDECAR", detail: "still sidecar" }],
      remediation: "rebuild" as const,
    }));
    const result = await runPipeline(
      {
        transcript: "add Redis in front of the DB",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "build", reason: "structural" }),
        build,
        verify,
      }),
    );
    expect(build).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene.edges.api_to_db).toBeDefined();
  });

  it("splices Redis in front of the DB with real applyEditPlan and verifyEdit", async () => {
    const scene = apiDbScene();
    scene.selection = [];
    const before = sceneHash(scene);
    const build = vi.fn(async () => ({
      calls: redisInsertCalls,
      say: "Inserted Redis in front of the DB.",
    }));
    const result = await runPipeline(
      {
        transcript: "add Redis in front of the DB",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "build", reason: "structural" }),
        build,
        verify: verifyEdit,
      }),
    );
    expect(build).toHaveBeenCalledTimes(1);
    expect(result.wrote).toBe(true);
    expect(result.ask).toBe(false);
    expect(sceneHash(result.scene)).not.toBe(before);
    expect(result.scene.edges.api_to_db).toBeUndefined();
    expect(hasEdge(result.scene, "api", "redis")).toBe(true);
    expect(hasEdge(result.scene, "redis", "db")).toBe(true);
    expect(noEdge(result.scene, "api", "db")).toBe(true);
  });
});

const sidecarPlan = {
  goal: "insert redis",
  steps: [
    { tool: "add_edge" as const, args: { from: "api", to: "db" } },
    { tool: "insert_on_path" as const, args: { node: "redis", on: "api_to_db" } },
  ],
  say: "Inserted Redis.",
};

const approvedRedisPlan = {
  goal: "insert redis in front of the db",
  steps: redisInsertCalls,
  expected: {
    nodesAdded: ["redis"],
    hasEdge: [
      { from: "api", to: "redis" },
      { from: "redis", to: "db" },
    ],
    noEdge: [{ from: "api", to: "db" }],
  },
  say: "Inserted Redis.",
};

describe("runPipeline plan review then tool loop", () => {
  it("replans once then applies an approved insert with real verify", async () => {
    expect(TURN_CAPS.maxReplans).toBe(1);
    const scene = apiDbScene();
    scene.selection = [];
    const before = sceneHash(scene);
    const plan = vi
      .fn()
      .mockResolvedValueOnce(sidecarPlan)
      .mockResolvedValueOnce(approvedRedisPlan);
    const result = await runPipeline(
      {
        transcript: "add Redis in front of the DB",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "plan", reason: "multi-step" }),
        verify: verifyEdit,
        plan,
      }),
    );
    expect(plan).toHaveBeenCalledTimes(2);
    expect(plan.mock.calls[1][0].rejectReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "SIDECAR_INSERT" }),
      ]),
    );
    expect(result.wrote).toBe(true);
    expect(result.ask).toBe(false);
    expect(sceneHash(result.scene)).not.toBe(before);
    expect(result.scene.edges.api_to_db).toBeUndefined();
    expect(hasEdge(result.scene, "api", "redis")).toBe(true);
    expect(hasEdge(result.scene, "redis", "db")).toBe(true);
    expect(noEdge(result.scene, "api", "db")).toBe(true);
  });

  it("fails closed after one replan when every plan is rejected", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const plan = vi.fn(async () => sidecarPlan);
    const result = await runPipeline(
      {
        transcript: "add Redis in front of the DB",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "plan", reason: "multi-step" }),
        verify: verifyEdit,
        plan,
      }),
    );
    expect(plan).toHaveBeenCalledTimes(2);
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.scene.edges.api_to_db).toBeDefined();
    expect(result.say).toMatch(/sidecar|add_edge|insert/i);
  });

  it("returns unknown and no write when judge routes plan without a plan dep", async () => {
    const scene = apiDbScene();
    const before = sceneHash(scene);
    const result = await runPipeline(
      {
        transcript: "add redis then cache then the db",
        scene,
        settings: keyed,
        pending: null,
      },
      deps({
        enhance: async () => readyInsert,
        judge: async () => ({ route: "plan", reason: "multi-step" }),
      }),
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.say === UNKNOWN_SAY || /unknown|catch/i.test(result.say)).toBe(
      true,
    );
  });
});

