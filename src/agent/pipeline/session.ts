import type { EditToolCall } from "../edit";
import type { Command } from "../../intent/types";
import type { Scene } from "../../scene/types";
import type { Settings } from "../../settings/store";
import type { VerifyInput, VerifyResult } from "../verify/predicates";

export type PipelineStage =
  | "idle"
  | "enhancing"
  | "asking"
  | "judging"
  | "planning"
  | "building"
  | "verifying"
  | "applying";

export type AskKind = "selection" | "text" | "either";

export type PendingAsk = {
  id: string;
  question: string;
  kind: AskKind;
  candidates: string[];
  originalTranscript: string;
  sceneHashAtAsk: string;
};

export type PipelineTrace = {
  stage: PipelineStage;
  enhancedSummary?: string;
  judgeRoute?: "command" | "build" | "plan";
  say?: string;
};

export type EnhancerOutput =
  | {
      status: "ready";
      summary: string;
      targetQueries: string[];
      ids?: string[];
      hints?: Record<string, unknown>;
      command?: Command; // optional pre-parsed command
    }
  | {
      status: "ask";
      kind: AskKind;
      say: string;
      candidates?: string[];
    }
  | { status: "refuse"; reason: string; say: string };

export type JudgeOutput = {
  route: "command" | "build" | "plan";
  reason: string;
};

export type PipelineDeps = {
  enhance: (input: {
    transcript: string;
    scene: Scene;
    pending: PendingAsk | null;
    followUpTo: string | null;
  }) => Promise<EnhancerOutput>;
  judge: (input: {
    transcript: string;
    intent: Extract<EnhancerOutput, { status: "ready" }>;
    scene: Scene;
  }) => Promise<JudgeOutput>;
  requestCommand: (
    transcript: string,
    selectionCount: number,
    selection: string[],
  ) => Promise<Command>;
  /** If missing and route is build, return unknown, no write. */
  build?: (input: {
    transcript: string;
    intent: Extract<EnhancerOutput, { status: "ready" }>;
    scene: Scene;
    errors?: unknown;
  }) => Promise<{ calls: EditToolCall[]; say: string }>;
  plan?: never; // Task 6
  /** Scene predicates + tool trace. Skip the rebuild loop if absent. */
  verify?: (input: VerifyInput) => VerifyResult;
};

export type PipelineInput = {
  transcript: string;
  scene: Scene;
  settings: Settings;
  pending: PendingAsk | null;
  signal?: AbortSignal;
  nowHash?: string; // if provided, compared before apply; default sceneHash(scene)
  liveHash?: string;
  getLiveHash?: () => string;
};

export type PipelineOutput = {
  scene: Scene;
  wrote: boolean;
  ask: boolean;
  pending: PendingAsk | null;
  say: string;
  answer: string | null;
  command: Command | null;
  trace: PipelineTrace;
  llmCalls: number;
};
