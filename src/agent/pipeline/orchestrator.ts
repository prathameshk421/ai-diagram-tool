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
    return {
      scene: turn.scene,
      wrote: turn.wrote,
      ask: turn.ask,
      pending: null,
      say: turn.say,
      answer: turn.answer,
      command: null,
      trace: { stage: "idle", say: turn.say },
      llmCalls: 0,
    };
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
      const buildCap = bump();
      if (buildCap) return buildCap;
      let built: { calls: EditToolCall[]; say: string };
      try {
        built = await deps.build({ transcript: trimmed, intent, scene });
      } catch {
        return unknownOut(scene, llmCalls);
      }
      if (aborted()) return unknownOut(scene, llmCalls);
      if (hashMismatch()) {
        return unknownOut(scene, llmCalls, BOARD_CHANGED_SAY, {
          stage: "idle",
          enhancedSummary: intent.summary,
          judgeRoute: "build",
          say: BOARD_CHANGED_SAY,
        });
      }
      const edited = applyEditPlan(scene, built.calls, { transcript: trimmed });
      return {
        scene: edited.ok ? edited.scene : scene,
        wrote: edited.ok && edited.wrote,
        ask: edited.ask,
        pending: null,
        say: edited.ask || !edited.ok ? edited.say : built.say,
        answer: edited.answer,
        command: null,
        trace: {
          stage: "idle",
          enhancedSummary: intent.summary,
          judgeRoute: "build",
          say: built.say,
        },
        llmCalls,
      };
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
    return {
      scene: turn.scene,
      wrote: turn.wrote,
      ask: turn.ask,
      pending: null,
      say: turn.say,
      answer: turn.answer,
      command,
      trace: {
        stage: "idle",
        enhancedSummary: intent.summary,
        judgeRoute: "command",
        say: turn.say,
      },
      llmCalls,
    };
  } catch {
    return unknownOut(scene, llmCalls);
  }
}
