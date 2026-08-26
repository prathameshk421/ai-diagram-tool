import { FLASH_MODEL, PRO_MODEL } from "../intent/types";
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
        OmniRoute URL (commands). Configure an OpenCode Go DeepSeek connection
        and an OmniRoute API key in the OmniRoute dashboard. This app does not
        install OpenCode. To use Pro, pick DeepSeek Pro after that model is
        wired in OmniRoute.
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
      <label>
        LLM model
        <select
          value={
            draft.omnirouteModel === PRO_MODEL ? PRO_MODEL : FLASH_MODEL
          }
          onChange={(event) =>
            onChange({ ...draft, omnirouteModel: event.target.value })
          }
        >
          <option value={FLASH_MODEL}>DeepSeek Flash</option>
          <option value={PRO_MODEL}>DeepSeek Pro</option>
        </select>
      </label>
      {!draft.groqApiKey.trim() ? (
        <p className="warn">Voice needs a Groq key. Type-in still works.</p>
      ) : null}
      {!draft.omnirouteApiKey.trim() ? (
        <p className="warn">
          Missed phrases will not use the LLM until an OmniRoute key is saved.
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
