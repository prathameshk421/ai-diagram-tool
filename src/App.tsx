import { useEffect, useRef, useState } from "react";
import { Board, type BoardTool } from "./canvas/Board";
import { BoardToolbar } from "./canvas/Toolbar";
import { CommandInput } from "./chrome/CommandInput";
import { CommandPreview } from "./chrome/CommandPreview";
import { ScenePreview } from "./chrome/ScenePreview";
import { SettingsDrawer } from "./chrome/SettingsDrawer";
import { StatusBar } from "./chrome/StatusBar";
import { resolveCommand } from "./intent/resolveCommand";
import { requestIntent } from "./intent/omnirouteClient";
import { type Command, unknownCommand } from "./intent/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings/store";
import { applyTurn } from "./scene/turn";
import { demoScene } from "./scene/empty";
import { SceneHistory } from "./scene/history";
import { hostUndoKind, isWholeBoardGen } from "./scene/host";
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
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const historyRef = useRef(boardHistory);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
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

  function undo() {
    const next = historyRef.current.undo(sceneRef.current);
    setScene(next);
    showToast("Undid last change.");
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
    if (isWholeBoardGen(trimmed)) {
      const result = applyTurn(
        sceneRef.current,
        { type: "ask", say: "" },
        trimmed,
      );
      setAnswer(result.answer);
      showToast(result.say);
      return;
    }
    setVoice("understanding");
    const current = sceneRef.current;
    const parsed = await resolveCommand(
      trimmed,
      current.selection.length,
      settings,
      requestIntent,
      current.selection,
    );
    const result = applyTurn(current, { type: "command", command: parsed }, trimmed);
    if (result.wrote) {
      historyRef.current.record(trimmed, current, result.scene);
    }
    setScene(result.scene);
    setCommand(parsed);
    setAnswer(result.answer);
    setVoice("idle");
    showToast(result.say);
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
    setVoice("understanding");
    const current = sceneRef.current;
    const commandResult = await resolveCommand(
      result.text,
      current.selection.length,
      settings,
      requestIntent,
      current.selection,
    );
    const applied = applyTurn(
      current,
      { type: "command", command: commandResult },
      result.text,
    );
    if (applied.wrote) {
      historyRef.current.record(result.text, current, applied.scene);
    }
    setScene(applied.scene);
    setCommand(commandResult);
    setAnswer(applied.answer);
    setVoice("idle");
    showToast(applied.say);
    busyRef.current = false;
  }

  async function toggleTalk() {
    if (voice === "listening") {
      await finishRecording();
      return;
    }
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
            onSubmit={() => {
              void runText(input);
              setInput("");
            }}
          />
          <button
            type="button"
            className={voice === "listening" ? "talk live" : "talk"}
            onClick={() => void toggleTalk()}
          >
            {voice === "listening" ? "Stop talking" : "Talk"}
          </button>
          <button type="button" className="secondary" onClick={undo} data-testid="undo">
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
        <StatusBar voice={voice} transcript={transcript} toast={toast} />
      </header>
      <div className="workspace">
        <Board
          scene={scene}
          tool={tool}
          onChange={setScene}
          onCheckpoint={() => historyRef.current.snapshot(sceneRef.current)}
        />
        <aside className="side">
          <CommandPreview command={command} />
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
