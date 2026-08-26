import { useEffect, useRef, useState } from "react";
import { CommandInput } from "./chrome/CommandInput";
import { CommandPreview } from "./chrome/CommandPreview";
import { SettingsDrawer } from "./chrome/SettingsDrawer";
import { StatusBar } from "./chrome/StatusBar";
import { keywordParser } from "./intent/keywordParser";
import { resolveCommand } from "./intent/resolveCommand";
import { type Command, unknownCommand } from "./intent/types";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "./settings/store";
import { VoiceRecorder } from "./voice/recorder";
import { transcribeAudio } from "./voice/transcribeClient";

type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "understanding"
  | "no-mic"
  | "error";

const MIN_MS = 300;
const MAX_MS = 15_000;

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
  const [selectionCount, setSelectionCount] = useState(1);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [command, setCommand] = useState<Command | null>(null);
  const [toast, setToast] = useState("");
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setDraft(loaded);
  }, []);

  useEffect(() => {
    return () => {
      if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
  }

  async function runText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const parsed = await resolveCommand(trimmed, selectionCount, settings);
    setCommand(parsed);
    showToast(parsed.say);
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
    if (!result.text || result.noSpeechProb >= 0.6) {
      const unknown = unknownCommand();
      setTranscript(result.text);
      setCommand(unknown);
      setVoice("idle");
      showToast(unknown.say);
      busyRef.current = false;
      return;
    }
    setTranscript(result.text);
    const needsLlm =
      settings.omnirouteApiKey.trim() &&
      settings.omnirouteUrl.trim();
    // Peek keywords so we can show understanding only when LLM will run.
    const parsed = keywordParser(result.text);
    if (
      needsLlm &&
      parsed.op === "unknown" &&
      parsed.confidence === 0
    ) {
      setVoice("understanding");
    }
    const commandResult = await resolveCommand(
      result.text,
      selectionCount,
      settings,
    );
    setCommand(commandResult);
    setVoice("idle");
    showToast(commandResult.say);
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
        <h1>AI diagram agent path</h1>
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
        <label className="count">
          Selection count (stub)
          <input
            type="number"
            min={0}
            value={selectionCount}
            onChange={(event) =>
              setSelectionCount(Number(event.target.value) || 0)
            }
          />
        </label>
        <StatusBar voice={voice} transcript={transcript} toast={toast} />
      </header>
      <CommandPreview command={command} />
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
