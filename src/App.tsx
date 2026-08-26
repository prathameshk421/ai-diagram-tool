import { useEffect, useRef, useState } from "react";
import { Board, type BoardTool } from "./canvas/Board";
import { BoardToolbar } from "./canvas/Toolbar";
import { ClarifyPanel } from "./chrome/ClarifyPanel";
import { CommandInput } from "./chrome/CommandInput";
import { CommandPreview } from "./chrome/CommandPreview";
import { ScenePreview } from "./chrome/ScenePreview";
import { SettingsDrawer } from "./chrome/SettingsDrawer";
import { StatusBar } from "./chrome/StatusBar";
import { runPipeline } from "./agent/pipeline/orchestrator";
import type {
  PendingAsk,
  PipelineDeps,
  PipelineStage,
  PipelineTrace,
} from "./agent/pipeline/session";
import { resolveCommand } from "./intent/resolveCommand";
import { requestIntent } from "./intent/omnirouteClient";
import { type Command, unknownCommand } from "./intent/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings/store";
import { demoScene } from "./scene/empty";
import { sceneHash } from "./scene/hash";
import { SceneHistory } from "./scene/history";
import { hostUndoKind } from "./scene/host";
import { loadScene, saveScene } from "./scene/persist";
import { projectForAgent } from "./scene/project";
import type { Scene } from "./scene/types";
import { VoiceRecorder } from "./voice/recorder";
import {
  shouldSkipIntentFromStt,
  transcribeAudio,
} from "./voice/transcribeClient";

type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "understanding"
  | "no-mic"
  | "error";

const MIN_MS = 300;
const MAX_MS = 15_000;
const boardHistory = new SceneHistory();

const COPY = {
  missingGroq: "Add a Groq API key in Settings.",
  groqFail: "Couldn’t transcribe. Check the Groq key in Settings.",
  micBlocked: "Microphone blocked. Allow mic access.",
  noMime: "Audio format not supported. Use Chrome, or type a command.",
  tooShort: "Hold Talk a bit longer, or type a command.",
};

function isPipelineRunning(stage: PipelineStage): boolean {
  return stage !== "idle" && stage !== "asking";
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [input, setInput] = useState("");
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [command, setCommand] = useState<Command | null>(null);
  const [toast, setToast] = useState("");
  const [scene, setScene] = useState<Scene>(() => demoScene());
  const [tool, setTool] = useState<BoardTool>("select");
  const [answer, setAnswer] = useState<string | null>(null);
  const [pendingAsk, setPendingAsk] = useState<PendingAsk | null>(null);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [trace, setTrace] = useState<PipelineTrace | undefined>(undefined);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const historyRef = useRef(boardHistory);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const pendingRef = useRef(pendingAsk);
  pendingRef.current = pendingAsk;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);

  const pipelineRunning = isPipelineRunning(stage);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setDraft(loaded);
    const stored = loadScene();
    if (stored) setScene(stored);
  }, []);

  useEffect(() => {
    saveScene(scene);
  }, [scene]);

  useEffect(() => {
    return () => {
      if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const el = event.target as HTMLElement | null;
        if (el?.closest?.(".board-label-input")) return;
        if (stageRef.current !== "idle") {
          event.preventDefault();
          cancelPipeline();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (isPipelineRunning(stageRef.current)) return;
        const next = historyRef.current.undo(sceneRef.current);
        setScene(next);
        setToast("Undid last change.");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function showToast(message: string) {
    setToast(message);
  }

  function pipelineDeps(): PipelineDeps {
    const currentSettings = settingsRef.current;
    return {
      enhance: async ({ transcript: text }) => ({
        status: "ready",
        summary: text,
        targetQueries: [],
      }),
      judge: async () => ({ route: "command" as const, reason: "default" }),
      requestCommand: (t, n, sel) =>
        resolveCommand(t, n, currentSettings, requestIntent, sel),
    };
  }

  function cancelPipeline() {
    abortRef.current?.abort();
    runIdRef.current += 1;
    busyRef.current = false;
    abortRef.current = null;
    setPendingAsk(null);
    pendingRef.current = null;
    setStage("idle");
    setVoice("idle");
    showToast("Cancelled.");
  }

  function undo() {
    if (isPipelineRunning(stageRef.current)) return;
    const next = historyRef.current.undo(sceneRef.current);
    setScene(next);
    showToast("Undid last change.");
  }

  async function executePipeline(text: string) {
    const runId = ++runIdRef.current;
    const ac = new AbortController();
    abortRef.current = ac;
    setVoice("understanding");
    setStage("enhancing");
    setTranscript(text);
    const start = sceneRef.current;
    try {
      const out = await runPipeline(
        {
          transcript: text,
          scene: start,
          settings: settingsRef.current,
          pending: pendingRef.current,
          signal: ac.signal,
          getLiveHash: () => sceneHash(sceneRef.current),
        },
        pipelineDeps(),
      );
      if (runId !== runIdRef.current) return;
      if (out.wrote) {
        historyRef.current.record(text, start, out.scene);
      }
      setScene(out.scene);
      setCommand(out.command);
      setAnswer(out.answer);
      setTrace(out.trace);
      if (out.ask && out.pending) {
        setPendingAsk(out.pending);
        pendingRef.current = out.pending;
        setStage("asking");
        setVoice("idle");
      } else {
        setPendingAsk(null);
        pendingRef.current = null;
        setStage("idle");
        setVoice("idle");
        showToast(out.say);
      }
    } catch {
      if (runId !== runIdRef.current) return;
      setPendingAsk(null);
      pendingRef.current = null;
      setStage("idle");
      setVoice("idle");
      showToast(unknownCommand().say);
    }
  }

  async function runText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const undoKind = hostUndoKind(trimmed);
    if (undoKind === "full") {
      undo();
      return;
    }
    if (undoKind && "hunk" in undoKind) {
      const next = historyRef.current.undoHunk(undoKind.hunk, sceneRef.current);
      setScene(next);
      showToast(`Reverted ${undoKind.hunk}.`);
      return;
    }
    if (isPipelineRunning(stageRef.current)) return;
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await executePipeline(trimmed);
    } finally {
      busyRef.current = false;
    }
  }

  function answerWithSelection(ids: string[]) {
    const ask = pendingRef.current;
    if (!ask) return;
    const next = { ...sceneRef.current, selection: ids };
    sceneRef.current = next;
    setScene(next);
    void runText(ask.originalTranscript);
  }

  async function finishRecording() {
    if (busyRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder) return;
    busyRef.current = true;
    if (maxTimerRef.current) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    setVoice("transcribing");
    const { blob, mime, durationMs } = await recorder.stop();
    recorderRef.current = null;
    if (durationMs < MIN_MS) {
      setVoice("idle");
      showToast(COPY.tooShort);
      busyRef.current = false;
      return;
    }
    const result = await transcribeAudio(blob, settings.groqApiKey, mime);
    if (!result.ok) {
      setVoice(result.error === "missing_key" ? "idle" : "error");
      showToast(
        result.error === "missing_key" ? COPY.missingGroq : COPY.groqFail,
      );
      busyRef.current = false;
      return;
    }
    if (shouldSkipIntentFromStt(result.text, result.noSpeechProb)) {
      const unknown = unknownCommand();
      setTranscript(result.text);
      setCommand(unknown);
      setVoice("idle");
      showToast(unknown.say);
      busyRef.current = false;
      return;
    }
    setTranscript(result.text);
    try {
      await executePipeline(result.text);
    } finally {
      busyRef.current = false;
    }
  }

  async function toggleTalk() {
    if (voice === "listening") {
      await finishRecording();
      return;
    }
    if (pipelineRunning) return;
    if (voice === "transcribing" || voice === "understanding") return;
    if (!settings.groqApiKey.trim()) {
      showToast(COPY.missingGroq);
      return;
    }
    const recorder = new VoiceRecorder();
    const started = await recorder.start();
    if (started === "no-mic") {
      setVoice("no-mic");
      showToast(COPY.micBlocked);
      return;
    }
    if (started === "no-mime") {
      setVoice("error");
      showToast(COPY.noMime);
      return;
    }
    recorderRef.current = recorder;
    setVoice("listening");
    maxTimerRef.current = window.setTimeout(() => {
      void finishRecording();
    }, MAX_MS);
  }

  return (
    <div className="app">
      <header className="chrome">
        <h1>Architecture board</h1>
        <div className="row">
          <CommandInput
            value={input}
            onChange={setInput}
            mode={stage === "asking" ? "answer" : "command"}
            disabled={pipelineRunning}
            onSubmit={() => {
              void runText(input);
              setInput("");
            }}
          />
          <button
            type="button"
            className={voice === "listening" ? "talk live" : "talk"}
            onClick={() => void toggleTalk()}
            disabled={pipelineRunning && voice !== "listening"}
          >
            {voice === "listening" ? "Stop talking" : "Talk"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={undo}
            data-testid="undo"
            disabled={pipelineRunning}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(settings);
              setDrawerOpen(true);
            }}
          >
            Settings
          </button>
        </div>
        <BoardToolbar tool={tool} onTool={setTool} />
        <StatusBar
          voice={voice}
          transcript={transcript}
          toast={toast}
          stage={stage}
        />
        {pendingAsk ? (
          <ClarifyPanel
            ask={pendingAsk}
            selection={scene.selection}
            onAnswerSelection={answerWithSelection}
            onCancel={cancelPipeline}
          />
        ) : null}
      </header>
      <div className="workspace">
        <Board
          scene={scene}
          tool={tool}
          onChange={setScene}
          onCheckpoint={() => historyRef.current.snapshot(sceneRef.current)}
          pickHint={
            pendingAsk ? { candidates: pendingAsk.candidates } : null
          }
        />
        <aside className="side">
          <CommandPreview command={command} trace={trace} />
          {answer ? (
            <section className="preview answer" aria-label="Answer">
              <h2>Answer</h2>
              <p>{answer}</p>
            </section>
          ) : null}
          <ScenePreview value={projectForAgent(scene)} />
        </aside>
      </div>
      {drawerOpen ? (
        <SettingsDrawer
          draft={draft}
          onChange={setDraft}
          onSave={() => {
            saveSettings(draft);
            setSettings(draft);
            setDrawerOpen(false);
          }}
          onClose={() => {
            setDraft(settings);
            setDrawerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
