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
      return unknownOut(scene, llmCalls, unknownCommand().say, {
        stage: "idle",
        enhancedSummary: intent.summary,
        judgeRoute: "plan",
        say: unknownCommand().say,
      });
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
        if (aborted()) return unknownOut(original, llmCalls);
        if (hashMismatch()) {
          return unknownOut(original, llmCalls, BOARD_CHANGED_SAY, {
            stage: "idle",
            enhancedSummary: intent.summary,
            judgeRoute: "build",
            say: BOARD_CHANGED_SAY,
          });
        }
        const edited = applyEditPlan(original, built.calls, {
          transcript: trimmed,
        });
        if (edited.ask) {
          return withTurnAsk(
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
              enhancedSummary: intent.summary,
              judgeRoute: "build",
            },
          );
        }
        if (!edited.ok) {
          lastErrors = edited.errors;
          lastSay = edited.say;
          continue;
        }
        if (!deps.verify) {
          return withTurnAsk(
            {
              scene: edited.scene,
              wrote: edited.wrote,
              ask: false,
              answer: edited.answer,
              say: built.say,
            },
            trimmed,
            startHash,
            {
              command: null,
              llmCalls,
              enhancedSummary: intent.summary,
              judgeRoute: "build",
            },
          );
        }
        const verified = deps.verify({
          before: original,
          after: edited.scene,
          transcript: trimmed,
          calls: built.calls,
        });
        if (verified.pass) {
          return withTurnAsk(
            {
              scene: edited.scene,
              wrote: edited.wrote,
              ask: false,
              answer: edited.answer,
              say: built.say,
            },
            trimmed,
            startHash,
            {
              command: null,
              llmCalls,
              enhancedSummary: intent.summary,
              judgeRoute: "build",
            },
          );
        }
        if (verified.remediation === "ask") {
          return withTurnAsk(
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
              enhancedSummary: intent.summary,
              judgeRoute: "build",
            },
          );
        }
        lastErrors = verified.failures;
        lastSay = verified.failures[0]?.detail || lastSay;
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
