import { useEffect, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { CanvasStage } from "./components/CanvasStage";
import { VoiceBar } from "./components/VoiceBar";
import { AuthBar } from "./components/AuthBar";
import { fetchHealth } from "./api";
import "./App.css";

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [lastCommand, setLastCommand] = useState("none yet");
  const [selectionHint] = useState("nothing selected");

  useEffect(() => {
    fetchHealth()
      .then((ok) => setApiOk(ok))
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <strong>ai-diagram-tool</strong>
          <span className="muted"> software architecture</span>
        </div>
        <div className="header-right">
          <AuthBar />
          <div className={`api-chip ${apiOk ? "up" : apiOk === false ? "down" : ""}`}>
            API {apiOk === null ? "…" : apiOk ? "up" : "down"}
          </div>
        </div>
      </header>
      <Toolbar
        onCommand={(name) => setLastCommand(name)}
        selectionHint={selectionHint}
      />
      <CanvasStage />
      <VoiceBar lastCommand={lastCommand} />
    </div>
  );
}
