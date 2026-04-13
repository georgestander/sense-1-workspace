export { GeneralSettingsSection } from "./GeneralSettingsSection";
export { BehaviorSettingsSection } from "./BehaviorSettingsSection";
export { TeamSettingsSection } from "./TeamSettingsSection";

import type { DesktopSettings } from "../../../main/contracts";

type SectionProps = {
  settingsError: { key: string; message: string } | null;
  settingsData: DesktopSettings | null;
  saveSettings: (updates: Partial<DesktopSettings>) => void;
};

export function ConfigurationSettingsSection({ saveSettings, settingsData, settingsError }: SectionProps) {
  return (
    <>
      <h2 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">Configuration</h2>
      <p className="mt-[0.2rem] text-[0.875rem] leading-[1.6] text-ink-muted">Session startup defaults, workspace attachment behavior, and runtime instructions.</p>
      {settingsData ? (
        <div className="mt-[1.25rem] flex flex-col gap-[1.25rem]">
          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Runtime instructions</span>
            <textarea
              className="min-h-[8rem] rounded-md bg-surface-high px-[0.65rem] py-[0.55rem] font-mono text-[0.8125rem] leading-[1.5] text-ink outline-none placeholder:text-ink-muted focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ runtimeInstructions: e.target.value })}
              placeholder="Leave blank to use the built-in runtime contract."
              spellCheck={false}
              value={settingsData.runtimeInstructions ?? ""}
            />
            {settingsError?.key === "runtimeInstructions" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                Custom instructions prepended to the built-in workspace and safety rules for each run.
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Default operating mode</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ defaultOperatingMode: e.target.value as DesktopSettings["defaultOperatingMode"] })}
              value={settingsData.defaultOperatingMode}
            >
              <option value="preview">Preview</option>
              <option value="auto">Auto</option>
              <option value="apply">Apply</option>
            </select>
            {settingsError?.key === "defaultOperatingMode" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                New workspace threads start in this mode until you set a workspace-specific mode.
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Read-only workspace mode</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ workspaceReadonly: e.target.value as "allow" | "readonly" })}
              value={settingsData.workspaceReadonly ?? "allow"}
            >
              <option value="allow">Allow file changes</option>
              <option value="readonly">Read-only (no file modifications)</option>
            </select>
            {settingsError?.key === "workspaceReadonly" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                {(settingsData.workspaceReadonly ?? "allow") === "allow"
                  ? "Sense-1 can create, modify, and delete files in the workspace."
                  : "Sense-1 cannot modify any files. It can only read and discuss the workspace contents."}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Folder-bound threads</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ workspaceFolderBinding: e.target.value as "inherit" | "none" })}
              value={settingsData.workspaceFolderBinding ?? "inherit"}
            >
              <option value="inherit">New threads inherit the workspace folder</option>
              <option value="none">Threads start without a folder</option>
            </select>
            {settingsError?.key === "workspaceFolderBinding" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                {(settingsData.workspaceFolderBinding ?? "inherit") === "inherit"
                  ? "New threads automatically use the current workspace folder."
                  : "Each new thread starts without a folder. You choose one when needed."}
              </p>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-[1.25rem] text-[0.875rem] leading-[1.6] text-ink-muted">Loading settings...</p>
      )}
    </>
  );
}

export function PersonalizationSettingsSection({ saveSettings, settingsData, settingsError }: SectionProps) {
  return (
    <>
      <h2 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">Personalization</h2>
      <p className="mt-[0.2rem] text-[0.875rem] leading-[1.6] text-ink-muted">Choose how Sense-1 sounds when new sessions begin.</p>
      {settingsData ? (
        <div className="mt-[1.25rem] flex flex-col gap-[1.25rem]">
          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Personality / tone</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ personality: e.target.value as "none" | "friendly" | "pragmatic" })}
              value={settingsData.personality}
            >
              <option value="none">None</option>
              <option value="friendly">Friendly</option>
              <option value="pragmatic">Pragmatic</option>
            </select>
            {settingsError?.key === "personality" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                This becomes the default tone for new desktop runs until you override it in a thread.
              </p>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-[1.25rem] text-[0.875rem] leading-[1.6] text-ink-muted">Loading settings...</p>
      )}
    </>
  );
}

export function UsageSettingsSection({ saveSettings, settingsData, settingsError }: SectionProps) {
  return (
    <>
      <h2 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">Usage</h2>
      <p className="mt-[0.2rem] text-[0.875rem] leading-[1.6] text-ink-muted">
        Set Sense-1's desktop defaults for when it pauses before risky work. Native runtime approval requests can still appear on their own.
      </p>
      {settingsData ? (
        <div className="mt-[1.25rem] flex flex-col gap-[1.25rem]">
          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Approval posture</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ approvalPosture: e.target.value as "onRequest" | "unlessTrusted" | "never" })}
              value={settingsData.approvalPosture}
            >
              <option value="onRequest">Follow runtime approval requests</option>
              <option value="unlessTrusted">Loosen prompts in trusted contexts</option>
              <option value="never">Minimize desktop prompts</option>
            </select>
            {settingsError?.key === "approvalPosture" ? (
              <p aria-live="assertive" className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]" role="alert">{settingsError.message}</p>
            ) : (
              <p className={`mt-[0.2rem] text-[0.8125rem] leading-[1.52] ${settingsData.approvalPosture === "never" ? "text-[oklch(70%_0.12_80)]" : "text-ink-muted"}`}>
                {settingsData.approvalPosture === "onRequest"
                  ? "Sense-1 waits when the runtime reports that approval is needed."
                  : settingsData.approvalPosture === "unlessTrusted"
                    ? "Trusted folders can reduce Sense-1's own desktop prompts. Runtime checks can still stop a turn."
                    : "Sense-1 adds fewer desktop-side pauses, but runtime and safety checks can still stop work."}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Sandbox posture</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ sandboxPosture: e.target.value as "workspaceWrite" | "readOnly" })}
              value={settingsData.sandboxPosture}
            >
              <option value="workspaceWrite">Workspace write</option>
              <option value="readOnly">Read only</option>
            </select>
            {settingsError?.key === "sandboxPosture" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                {settingsData.sandboxPosture === "workspaceWrite"
                  ? "Sense-1 can create, modify, and delete files within the workspace folder."
                  : "Sense-1 cannot modify any files. It can only read and discuss workspace contents."}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Desktop approval strictness</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ approvalOperationPosture: e.target.value as "askAll" | "askRisky" | "autoAll" })}
              value={settingsData.approvalOperationPosture ?? "askAll"}
            >
              <option value="askAll">Pause before most operations</option>
              <option value="askRisky">Pause mainly for risky operations</option>
              <option value="autoAll">Do not add extra desktop pauses</option>
            </select>
            {settingsError?.key === "approvalOperationPosture" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className={`mt-[0.2rem] text-[0.8125rem] leading-[1.52] ${(settingsData.approvalOperationPosture ?? "askAll") === "autoAll" ? "text-[oklch(70%_0.12_80)]" : "text-ink-muted"}`}>
                {(settingsData.approvalOperationPosture ?? "askAll") === "askAll"
                  ? "Sense-1 adds a desktop pause before most file, command, or network actions."
                  : (settingsData.approvalOperationPosture ?? "askAll") === "askRisky"
                    ? "Sense-1 mainly pauses for riskier operations. The runtime can still ask for approval separately."
                    : "Sense-1 does not add extra desktop pauses here. Runtime and safety checks can still interrupt work."}
              </p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Trusted workspace rules</span>
            <input
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none placeholder:text-ink-muted focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ approvalTrustedWorkspaces: e.target.value })}
              placeholder="e.g. ~/projects/my-app, ~/work/*"
              type="text"
              value={settingsData.approvalTrustedWorkspaces ?? ""}
            />
            {settingsError?.key === "approvalTrustedWorkspaces" ? (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                Comma-separated folder paths used by Sense-1's desktop trust rules. Native runtime approval behavior is separate.
              </p>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-[1.25rem] text-[0.875rem] leading-[1.6] text-ink-muted">Loading settings...</p>
      )}
    </>
  );
}
