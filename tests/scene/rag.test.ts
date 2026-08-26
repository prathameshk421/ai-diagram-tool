import { describe, expect, it } from "vitest";
import { applyInsertRedisInFront } from "../../src/scene/commandAdapter";
import { defaultNode } from "../../src/scene/empty";
import { sceneHash } from "../../src/scene/hash";
import {
  isColorQuery,
  isSplitAsk,
  isWholeBoardGen,
  WHOLE_BOARD_SAY,
} from "../../src/scene/host";
import { compile } from "../../src/scene/kernel";
import { applyTurn } from "../../src/scene/turn";
import { cloneJson } from "../../src/scene/clone";
import type { Scene } from "../../src/scene/types";

function ragPipelineScene(): Scene {
  const scene: Scene = {
    schema: "arch-scene/v1",
    board: {
      grid: 8,
      flow: "left-to-right",
      palette: "architecture",
      style: "sketch",
      legend: false,
    },
    selection: [],
    lastDrawn: null,
    nodes: {
      users: defaultNode({
        kind: "actor",
        label: "Users",
        shape: "actor",
        pin: { x: 20, y: 140 },
      }),
      gateway: defaultNode({
        kind: "gateway",
        label: "API Gateway",
        icon: "apigw",
        pin: { x: 180, y: 140 },
      }),
      orchestrator: defaultNode({
        kind: "service",
        label: "Orchestrator",
        pin: { x: 360, y: 140 },
      }),
      embedder: defaultNode({
        kind: "service",
        label: "Embedder",
        pin: { x: 540, y: 40 },
      }),
      vectordb: defaultNode({
        kind: "datastore",
        label: "Vector DB",
        icon: "database",
        shape: "cylinder",
        pin: { x: 720, y: 32 },
      }),
      llm: defaultNode({
        kind: "service",
        label: "LLM",
        pin: { x: 540, y: 240 },
      }),
    },
    edges: {
      users_to_gw: {
        from: "users",
        to: "gateway",
        label: "",
        kind: "sync",
        stroke: "solid",
        route: "straight",
        exposure: "internet",
      },
      gw_to_orch: {
        from: "gateway",
        to: "orchestrator",
        label: "",
        kind: "sync",
        stroke: "solid",
        route: "straight",
        exposure: null,
      },
      orch_to_embed: {
        from: "orchestrator",
        to: "embedder",
        label: "query",
        kind: "sync",
        stroke: "solid",
        route: "straight",
        exposure: null,
      },
      embed_to_vec: {
        from: "embedder",
        to: "vectordb",
        label: "search",
        kind: "sync",
        stroke: "solid",
        route: "straight",
        exposure: null,
      },
      orch_to_llm: {
        from: "orchestrator",
        to: "llm",
        label: "context",
        kind: "sync",
        stroke: "solid",
        route: "straight",
        exposure: null,
      },
    },
    groups: {},
    ink: {},
    passes: [],
    constraints: [],
    meta: { strict: false },
  };
  return scene;
}

describe("RAG pipeline kernel", () => {
  it("inserts a cache on the embedder path without leaving orchestrator→embedder", () => {
    const scene = ragPipelineScene();
    const next = applyInsertRedisInFront(scene, "embedder");
    const hops = Object.values(next.edges);
    expect(hops.some((e) => e.from === "orchestrator" && e.to === "embedder")).toBe(
      false,
    );
    expect(hops.some((e) => e.from === "orchestrator" && e.to === "redis")).toBe(
      true,
    );
    expect(hops.some((e) => e.from === "redis" && e.to === "embedder")).toBe(true);
    expect(next.nodes.redis.kind).toBe("cache");
  });

  it("beautify restyles in place and does not invent AWS icons", () => {
    const scene = ragPipelineScene();
    const pins = Object.fromEntries(
      Object.entries(scene.nodes).map(([id, n]) => [id, { ...n.pin! }]),
    );
    const kinds = Object.fromEntries(
      Object.entries(scene.nodes).map(([id, n]) => [id, n.kind]),
    );
    scene.passes = [{ type: "beautify", scope: "board" }];
    compile(scene);
    expect(scene.board.style).toBe("clean");
    for (const [id, pin] of Object.entries(pins)) {
      expect(scene.nodes[id].pin).toEqual(pin);
      expect(scene.nodes[id].kind).toBe(kinds[id]);
    }
    expect(scene.nodes.vectordb.icon).not.toBe("rds");
    expect(Object.keys(scene.nodes).sort()).toEqual(Object.keys(pins).sort());
  });

  it("fan-out: adding a reranker does not drop orchestrator→llm unless insert is used", () => {
    const scene = ragPipelineScene();
    scene.nodes.reranker = defaultNode({
      kind: "service",
      label: "Reranker",
      pin: { x: 540, y: 140 },
    });
    scene.edges.orch_to_rerank = {
      from: "orchestrator",
      to: "reranker",
      label: "",
      kind: "sync",
      stroke: "solid",
      route: "ortho",
      exposure: null,
    };
    compile(scene);
    expect(scene.edges.orch_to_llm.to).toBe("llm");
    expect(scene.edges.orch_to_rerank.to).toBe("reranker");
  });

  it("async ingest worker uses a dashed edge and does not splice the query path", () => {
    const scene = ragPipelineScene();
    scene.nodes.ingest = defaultNode({
      kind: "service",
      label: "Ingest worker",
      pin: { x: 360, y: 40 },
    });
    scene.edges.ingest_to_embed = {
      from: "ingest",
      to: "embedder",
      label: "chunks",
      kind: "async",
      stroke: "solid",
      route: "straight",
      exposure: null,
    };
    compile(scene);
    expect(scene.edges.ingest_to_embed.stroke).toBe("dashed");
    expect(scene.edges.orch_to_embed.from).toBe("orchestrator");
    expect(scene.edges.orch_to_embed.to).toBe("embedder");
  });

  it("annotate-path numbers the unique users→llm route", () => {
    const scene = ragPipelineScene();
    scene.passes = [{ type: "annotate-path", from: "users", to: "llm" }];
    compile(scene);
    const numbered = Object.values(scene.edges)
      .map((e) => e.label)
      .filter((l) => /^[0-9]+$/.test(l));
    expect(numbered.length).toBeGreaterThanOrEqual(2);
  });
});

describe("WONTFIX and host channels on a RAG board", () => {
  const align = {
    op: "align" as const,
    args: { edge: "left" },
    confidence: 0.9,
    say: "Aligned left.",
  };

  it("refuses a whole-board RAG paragraph and keeps SHA stable", () => {
    const scene = ragPipelineScene();
    const before = sceneHash(scene);
    const prompt =
      "Build an AI RAG pipeline architecture with users, an API gateway, an embedder, a vector database, and an LLM.";
    expect(isWholeBoardGen(prompt)).toBe(true);
    const result = applyTurn(scene, { type: "command", command: align }, prompt);
    expect(result.wrote).toBe(false);
    expect(result.say).toBe(WHOLE_BOARD_SAY);
    expect(sceneHash(result.scene)).toBe(before);
    expect(Object.keys(result.scene.nodes)).toEqual(Object.keys(scene.nodes));
  });

  it("does not treat a short align as whole-board generation", () => {
    expect(isWholeBoardGen("align left")).toBe(false);
    expect(isWholeBoardGen("build redis")).toBe(false);
  });

  it("questions do not add a cache or rewrite the RAG graph", () => {
    const scene = ragPipelineScene();
    const before = sceneHash(scene);
    const result = applyTurn(
      scene,
      { type: "command", command: align },
      "are we missing a cache?",
    );
    expect(result.wrote).toBe(false);
    expect(sceneHash(result.scene)).toBe(before);
    expect(result.answer).toMatch(/no cache/i);
    expect(result.scene.nodes.redis).toBeUndefined();
  });

  it("asks on color targeting and on split without named edges", () => {
    const scene = ragPipelineScene();
    const before = sceneHash(scene);
    expect(isColorQuery("make the blue one the vector db")).toBe(true);
    const color = applyTurn(
      scene,
      { type: "command", command: align },
      "the blue one",
    );
    expect(color.ask).toBe(true);
    expect(sceneHash(color.scene)).toBe(before);
    expect(isSplitAsk("split auth out of the orchestrator")).toBe(true);
    const split = applyTurn(
      cloneJson(scene),
      { type: "command", command: align },
      "split auth out of the orchestrator",
    );
    expect(split.ask).toBe(true);
    expect(split.wrote).toBe(false);
  });
});
