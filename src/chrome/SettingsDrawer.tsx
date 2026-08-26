import type { Settings } from "../settings/store";

type Props = {
  draft: Settings;
  onChange: (next: Settings) => void;
  onSave: () => void;
  onClose: () => void;
};

export function SettingsDrawer({ draft, onChange, onSave, onClose }: Props) {
  return (
    <aside className="drawer" aria-label="Settings">
      <h2>Settings</h2>
      <p className="help">
        Keys stay in this browser. They are sent only to Groq (speech) and your
        OmniRoute URL (commands). The model id is <code>OMNIROUTE_MODEL</code> in
        <code>.env</code> — there is no model picker here.
      </p>
      <label>
        OmniRoute URL
        <input
          value={draft.omnirouteUrl}
          onChange={(event) =>
            onChange({ ...draft, omnirouteUrl: event.target.value })
          }
          placeholder="http://localhost:20128"
        />
      </label>
      <label>
        OmniRoute API key
        <input
          type="password"
          value={draft.omnirouteApiKey}
          onChange={(event) =>
            onChange({ ...draft, omnirouteApiKey: event.target.value })
          }
          placeholder="sk-…"
          autoComplete="off"
        />
      </label>
      <label>
        Groq API key
        <input
          type="password"
          value={draft.groqApiKey}
          onChange={(event) =>
            onChange({ ...draft, groqApiKey: event.target.value })
          }
          placeholder="gsk_…"
          autoComplete="off"
        />
      </label>
      {!draft.groqApiKey.trim() ? (
        <p className="warn">Voice needs a Groq key.</p>
      ) : null}
      {!draft.omnirouteApiKey.trim() ? (
        <p className="warn">
          Commands need an OmniRoute key. There is no keyword fallback.
        </p>
      ) : null}
      <div className="drawer-actions">
        <button type="button" onClick={onSave}>
          Save
        </button>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </aside>
  );
}
