import { applyEditPlan, type EditToolCall } from "../edit";
import { isCommand, unknownCommand, type Command } from "../../intent/types";
import {
  isColorQuery,
  isDuplicateBoardAsk,
  isSplitAsk,
  isWholeBoardGen,
  hostUndoKind,
} from "../../scene/host";
import { sceneHash } from "../../scene/hash";
import { applyTurn, isQuestion } from "../../scene/turn";
import type { Scene } from "../../scene/types";
import type { AgentPlan } from "../roles/parsePlan";
import { reviewPlan } from "../roles/reviewPlan";
import type { VerifyInput } from "../verify/predicates";
import { TURN_CAPS } from "./budgets";
import type {
  EnhancerOutput,
  JudgeOutput,
  PipelineDeps,
  PipelineInput,
  PipelineOutput,
  PipelineTrace,
  PendingAsk,
} from "./session";

const SELECT_SAY = "Select something on the board first.";
const BOARD_CHANGED_SAY = "Board changed — try again.";

function unknownOut(
  scene: Scene,
  llmCalls: number,
  say = unknownCommand().say,
  trace: PipelineTrace = { stage: "idle", say },
): PipelineOutput {
  return {
    scene,
    wrote: false,
    ask: false,
    pending: null,
    say,
    answer: null,
    command: unknownCommand(say),
    trace,
    llmCalls,
  };
}

function isHostSkip(transcript: string): boolean {
  return (
    Boolean(hostUndoKind(transcript)) ||
    isWholeBoardGen(transcript) ||
    isColorQuery(transcript) ||
    isSplitAsk(transcript) ||
    isDuplicateBoardAsk(transcript) ||
    isQuestion(transcript)
  );
}

function usableCommand(value: Command | undefined): Command | null {
  if (!value) return null;
  const parsed = isCommand(value);
  if (!parsed) return null;
  if (parsed.confidence < 0.45 || parsed.op === "unknown") return null;
  return parsed;
}

function liveHashOf(input: PipelineInput, startHash: string): string {
  if (input.getLiveHash) return input.getLiveHash();
  if (input.liveHash !== undefined) return input.liveHash;
  if (input.nowHash !== undefined) return input.nowHash;
  return startHash;
}

function newAskId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ask-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sceneAfterPipeline(
  live: Scene,
  out: PipelineOutput,
): Scene {
  return out.wrote ? out.scene : live;
}

function pendingFromAsk(
  scene: Scene,
  say: string,
  transcript: string,
  startHash: string,
  kind: PendingAsk["kind"] = "either",
): PendingAsk {
  return {
    id: newAskId(),
    question: say,
    kind,
    candidates: scene.selection.slice(),
    originalTranscript: transcript,
    sceneHashAtAsk: startHash,
  };
}

function withTurnAsk(
  turn: {
    scene: Scene;
    wrote: boolean;
    ask: boolean;
    answer: string | null;
    say: string;
  },
  transcript: string,
  startHash: string,
  extras: {
    command: Command | null;
    llmCalls: number;
    enhancedSummary?: string;
    judgeRoute?: PipelineTrace["judgeRoute"];
  },
): PipelineOutput {
  const pending = turn.ask
    ? pendingFromAsk(turn.scene, turn.say, transcript, startHash, "selection")
    : null;
  return {
    scene: turn.scene,
    wrote: turn.wrote,
    ask: turn.ask,
    pending,
    say: turn.say,
    answer: turn.answer,
    command: extras.command,
    trace: {
      stage: turn.ask ? "asking" : "idle",
      enhancedSummary: extras.enhancedSummary,
      judgeRoute: extras.judgeRoute,
      say: turn.say,
    },
    llmCalls: extras.llmCalls,
  };
}

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
): Promise<PipelineOutput> {
  const scene = input.scene;
  const trimmed = input.transcript.trim();
  if (!trimmed) {
    return unknownOut(scene, 0);
  }

  if (input.signal?.aborted) {
    return unknownOut(scene, 0);
  }

  if (isHostSkip(trimmed)) {
    if (hostUndoKind(trimmed)) {
      return unknownOut(scene, 0);
    }
    const turn = applyTurn(
      scene,
      { type: "command", command: unknownCommand() },
      trimmed,
    );
    return withTurnAsk(turn, trimmed, sceneHash(scene), {
      command: null,
      llmCalls: 0,
    });
  }

  const startHash = sceneHash(scene);
  let llmCalls = 0;

  const bump = (): PipelineOutput | null => {
    if (llmCalls >= TURN_CAPS.maxLlmCallsComplex) {
      return unknownOut(scene, llmCalls);
    }
    llmCalls += 1;
    return null;
  };

  const aborted = (): boolean => Boolean(input.signal?.aborted);

  const hashMismatch = (): boolean => liveHashOf(input, startHash) !== startHash;

  type ToolLoopResult =
    | { kind: "done"; out: PipelineOutput }
    | { kind: "rebuild"; errors: unknown; say: string };

  const runToolLoop = (
    original: Scene,
    calls: EditToolCall[],
    say: string,
    expected: VerifyInput["expected"],
    judgeRoute: "build" | "plan",
    enhancedSummary: string | undefined,
  ): ToolLoopResult => {
    if (aborted()) {
      return { kind: "done", out: unknownOut(original, llmCalls) };
    }
    if (hashMismatch()) {
      return {
        kind: "done",
        out: unknownOut(original, llmCalls, BOARD_CHANGED_SAY, {
          stage: "idle",
          enhancedSummary,
          judgeRoute,
          say: BOARD_CHANGED_SAY,
        }),
      };
    }
    const edited = applyEditPlan(original, calls, {
      transcript: trimmed,
      maxCalls: 12,
    });
    if (edited.ask) {
      return {
        kind: "done",
        out: withTurnAsk(
          {
            scene: original,
            wrote: false,
            ask: true,
            answer: null,
            say: edited.say,
          },
          trimmed,
          startHash,
          {
            command: null,
            llmCalls,
            enhancedSummary,
            judgeRoute,
          },
        ),
      };
    }
    if (!edited.ok) {
      return { kind: "rebuild", errors: edited.errors, say: edited.say };
    }
    if (!deps.verify) {
      return {
        kind: "done",
        out: withTurnAsk(
          {
            scene: edited.scene,
            wrote: edited.wrote,
            ask: false,
            answer: edited.answer,
            say,
          },
          trimmed,
          startHash,
          {
            command: null,
            llmCalls,
            enhancedSummary,
            judgeRoute,
          },
        ),
      };
    }
    const verified = deps.verify({
      before: original,
      after: edited.scene,
      transcript: trimmed,
      calls,
      expected,
    });
    if (verified.pass) {
      return {
        kind: "done",
        out: withTurnAsk(
          {
            scene: edited.scene,
            wrote: edited.wrote,
            ask: false,
            answer: edited.answer,
            say,
          },
          trimmed,
          startHash,
          {
            command: null,
            llmCalls,
            enhancedSummary,
            judgeRoute,
          },
        ),
      };
    }
    if (verified.remediation === "ask") {
      return {
        kind: "done",
        out: withTurnAsk(
          {
            scene: original,
            wrote: false,
            ask: true,
            answer: null,
            say: verified.failures[0]?.detail || SELECT_SAY,
          },
          trimmed,
          startHash,
          {
            command: null,
            llmCalls,
            enhancedSummary,
            judgeRoute,
          },
        ),
      };
    }
    return {
      kind: "rebuild",
      errors: verified.failures,
      say: verified.failures[0]?.detail || say,
    };
  };

  try {
    const capped = bump();
    if (capped) return capped;
    const enhanced = await deps.enhance({
      transcript: trimmed,
      scene,
      pending: input.pending,
      followUpTo: input.pending ? input.pending.id : null,
    });

    if (aborted()) return unknownOut(scene, llmCalls);

    if (enhanced.status === "ask") {
      if (input.pending) {
        return {
          scene,
          wrote: false,
          ask: false,
          pending: null,
          say: enhanced.say || SELECT_SAY,
          answer: null,
          command: null,
          trace: { stage: "idle", say: enhanced.say || SELECT_SAY },
          llmCalls,
        };
      }
      const pending: PendingAsk = {
        id: newAskId(),
        question: enhanced.say,
        kind: enhanced.kind,
        candidates: enhanced.candidates ?? [],
        originalTranscript: trimmed,
        sceneHashAtAsk: startHash,
      };
      return {
        scene,
        wrote: false,
        ask: true,
        pending,
        say: enhanced.say,
        answer: null,
        command: null,
        trace: { stage: "asking", enhancedSummary: undefined, say: enhanced.say },
        llmCalls,
      };
    }

    if (enhanced.status === "refuse") {
      return {
        scene,
        wrote: false,
        ask: false,
        pending: null,
        say: enhanced.say,
        answer: null,
        command: null,
        trace: { stage: "idle", say: enhanced.say },
        llmCalls,
      };
    }

    const intent: Extract<EnhancerOutput, { status: "ready" }> = enhanced;
    let route: JudgeOutput["route"] = "command";
    let command = usableCommand(intent.command);

    if (!command) {
      const judgeCap = bump();
      if (judgeCap) return judgeCap;
      let judged: JudgeOutput;
      try {
        judged = await deps.judge({
          transcript: trimmed,
          intent,
          scene,
        });
      } catch {
        return unknownOut(scene, llmCalls);
      }
      if (aborted()) return unknownOut(scene, llmCalls);
      route = judged.route;
      const overlay = usableCommand(intent.command);
      if (overlay) {
        route = "command";
        command = overlay;
      }
    } else {
      route = "command";
    }

    if (route === "plan") {
      if (!deps.plan) {
        return unknownOut(scene, llmCalls, unknownCommand().say, {
          stage: "idle",
          enhancedSummary: intent.summary,
          judgeRoute: "plan",
          say: unknownCommand().say,
        });
      }
      const original = scene;
      let replan = 0;
      let rejectReasons: unknown;
      while (true) {
        const planCap = bump();
        if (planCap) return planCap;
        let planned: AgentPlan | null;
        try {
          planned = await deps.plan({
            transcript: trimmed,
            intent,
            scene: original,
            rejectReasons,
          });
        } catch {
          return unknownOut(original, llmCalls);
        }
        if (aborted()) return unknownOut(original, llmCalls);
        if (!planned) {
          return unknownOut(original, llmCalls, unknownCommand().say, {
            stage: "idle",
            enhancedSummary: intent.summary,
            judgeRoute: "plan",
            say: unknownCommand().say,
          });
        }
        let review = reviewPlan(planned, {
          transcript: trimmed,
          scene: original,
        });
        if (review.verdict === "approve" && deps.reviewLlm) {
          const reviewCap = bump();
          if (reviewCap) return reviewCap;
          try {
            review = await deps.reviewLlm({
              plan: planned,
              transcript: trimmed,
              scene: original,
            });
          } catch {
            return unknownOut(original, llmCalls);
          }
          if (aborted()) return unknownOut(original, llmCalls);
        }
        if (review.verdict === "approve") {
          const loop = runToolLoop(
            original,
            planned.steps,
            planned.say,
            planned.expected,
            "plan",
            intent.summary,
          );
          if (loop.kind === "done") return loop.out;
          return unknownOut(original, llmCalls, loop.say, {
            stage: "idle",
            enhancedSummary: intent.summary,
            judgeRoute: "plan",
            say: loop.say,
          });
        }
        if (replan >= TURN_CAPS.maxReplans) {
          const say = review.reasons[0]?.detail || unknownCommand().say;
          return unknownOut(original, llmCalls, say, {
            stage: "idle",
            enhancedSummary: intent.summary,
            judgeRoute: "plan",
            say,
          });
        }
        replan += 1;
        rejectReasons = review.reasons;
      }
    }

    if (route === "build") {
      if (!deps.build) {
        return unknownOut(scene, llmCalls, unknownCommand().say, {
          stage: "idle",
          enhancedSummary: intent.summary,
          judgeRoute: "build",
          say: unknownCommand().say,
        });
      }
      const original = scene;
      let lastErrors: unknown;
      let lastSay = unknownCommand().say;
      for (let attempt = 0; attempt < TURN_CAPS.maxVerifyAttempts; attempt++) {
        const buildCap = bump();
        if (buildCap) return buildCap;
        let built: { calls: EditToolCall[]; say: string };
        try {
          built = await deps.build({
            transcript: trimmed,
            intent,
            scene: original,
            errors: lastErrors,
          });
        } catch {
          return unknownOut(original, llmCalls);
        }
        const loop = runToolLoop(
          original,
          built.calls,
          built.say,
          undefined,
          "build",
          intent.summary,
        );
        if (loop.kind === "done") return loop.out;
        lastErrors = loop.errors;
        lastSay = loop.say;
      }
      return unknownOut(original, llmCalls, lastSay, {
        stage: "idle",
        enhancedSummary: intent.summary,
        judgeRoute: "build",
        say: lastSay,
      });
    }

    if (!command) {
      if (llmCalls >= TURN_CAPS.maxLlmCallsComplex) {
        return unknownOut(scene, llmCalls);
      }
      llmCalls += 1;
      try {
        command = await deps.requestCommand(
          trimmed,
          scene.selection.length,
          scene.selection,
        );
      } catch {
        return unknownOut(scene, llmCalls);
      }
    }

    if (aborted()) return unknownOut(scene, llmCalls);
    if (hashMismatch()) {
      return unknownOut(scene, llmCalls, BOARD_CHANGED_SAY, {
        stage: "idle",
        enhancedSummary: intent.summary,
        judgeRoute: "command",
        say: BOARD_CHANGED_SAY,
      });
    }

    const turn = applyTurn(
      scene,
      { type: "command", command },
      trimmed,
    );
    return withTurnAsk(turn, trimmed, startHash, {
      command,
      llmCalls,
      enhancedSummary: intent.summary,
      judgeRoute: "command",
    });
  } catch {
    return unknownOut(scene, llmCalls);
  }
}
