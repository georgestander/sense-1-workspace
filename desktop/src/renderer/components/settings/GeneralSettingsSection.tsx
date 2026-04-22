import { ChevronRight, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { resolveSettingsUpdateSummary } from "../../features/updates/update-presentation.js";
import { useTheme, type ThemePreference } from "../../lib/theme";
import type { DesktopModelEntry, DesktopSettings, DesktopUpdateState, DesktopVerbosity } from "../../../main/contracts";
import { matchesSkillApprovalPath, parseSkillApprovalKey } from "../../../shared/skill-approval-key.js";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Monitor }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const REASONING_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

const VERBOSITY_OPTIONS: { value: DesktopVerbosity; label: string }[] = [
  { value: "terse", label: "Terse" },
  { value: "balanced", label: "Balanced" },
  { value: "detailed", label: "Detailed" },
];

const VERBOSITY_HELP: Record<DesktopVerbosity, string> = {
  terse: "Short answers. Sense-1 trims context and caveats — best when you just want the result.",
  balanced: "Moderate explanations alongside the result. Good default for most work.",
  detailed: "Longer, more thorough responses with explanations and context. Uses more tokens.",
};

type SectionProps = {
  settingsError: { key: string; message: string } | null;
  settingsData: DesktopSettings | null;
  saveSettings: (updates: Partial<DesktopSettings>) => void;
};

export type GeneralSettingsSectionProps = SectionProps & {
  availableModels: DesktopModelEntry[];
  checkForUpdates: () => Promise<void>;
  currentVersion: string | null;
  modelOptions: string[];
  openLatestRelease: () => Promise<void>;
  saveSettingsModelSelection: (nextModel: string) => void;
  settingsModel: string;
  settingsReasoning: string;
  settingsReasoningOptions: string[];
  settingsServiceTier: "flex" | "fast";
  updateState: DesktopUpdateState | null;
};

export function GeneralSettingsSection({
  availableModels,
  checkForUpdates: _checkForUpdates,
  currentVersion,
  modelOptions,
  openLatestRelease,
  saveSettings,
  saveSettingsModelSelection,
  settingsData,
  settingsError,
  settingsModel,
  settingsReasoning,
  settingsReasoningOptions,
  settingsServiceTier,
  updateState,
}: GeneralSettingsSectionProps) {
  const updateSummary = resolveSettingsUpdateSummary(updateState);
  const trustedSkillApprovals = settingsData?.trustedSkillApprovals ?? [];
  const [theme, setTheme] = useTheme();

  function removeTrustedSkillApproval(skillPath: string) {
    void saveSettings({
      trustedSkillApprovals: trustedSkillApprovals.filter((entry) => !matchesSkillApprovalPath(entry, skillPath)),
    });
  }

  return (
    <>
      <h2 className="font-display text-[1.05rem] font-semibold leading-[1.35] tracking-[-0.015em]">General</h2>
      <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Core desktop defaults for manual alpha installs, model selection, and reasoning depth.</p>
      {settingsData ? (
        <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
          <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.55rem]">
            <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Appearance</p>
            <div className="mt-[0.55rem] inline-flex rounded-lg bg-surface p-[0.2rem]">
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                const isActive = theme === value;
                return (
                  <button
                    aria-pressed={isActive}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-[0.65rem] py-[0.35rem] text-[0.8125rem] font-medium leading-[1.4] transition-colors",
                      isActive ? "bg-surface-high text-ink shadow-[0_1px_0_color-mix(in_oklch,var(--color-ink)_6%,transparent)]" : "text-ink-muted hover:text-ink",
                    )}
                    key={value}
                    onClick={() => setTheme(value)}
                    type="button"
                  >
                    <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-[0.4rem] text-[0.8125rem] leading-[1.52] text-ink-muted">System follows your operating system. Choose Light or Dark to override.</p>
          </div>

          <details className="group rounded-xl bg-surface-low px-[0.9rem] py-[0.55rem]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Current version</span>
                <span className="text-[0.8125rem] font-medium leading-[1.4] text-ink">{currentVersion ? `v${currentVersion}` : "unavailable"}</span>
              </div>
              <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-[0.5rem] flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cn("text-[0.875rem] font-medium leading-[1.6]", updateSummary.isError ? "text-danger" : "text-ink")}>
                  {updateSummary.title}
                </p>
                <p className="mt-[0.15rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                  {updateSummary.detail}
                </p>
                <p className="mt-[0.4rem] text-[0.75rem] leading-[1.5] text-ink-faint">
                  Testers should install newer alpha builds manually from the shared download page. macOS users replace the app in Applications; Windows users rerun the installer.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  className="rounded-full"
                  onClick={() => {
                    void openLatestRelease();
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Open alpha downloads
                </Button>
              </div>
            </div>
          </details>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Default model</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              disabled={modelOptions.length === 0}
              onChange={(e) => saveSettingsModelSelection(e.target.value)}
              value={settingsModel || ""}
            >
              {modelOptions.length > 0 ? (
                modelOptions.map((id) => (
                  <option key={id} value={id}>
                    {availableModels.find((m) => m.id === id)?.name ?? id}
                  </option>
                ))
              ) : (
                <option value="">Loading live models...</option>
              )}
            </select>
            {settingsError?.key === "model" ? (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-danger">{settingsError.message}</p>
            ) : null}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Reasoning effort</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              disabled={settingsReasoningOptions.length === 0}
              onChange={(e) => void saveSettings({ reasoningEffort: e.target.value })}
              value={settingsReasoning || ""}
            >
              {settingsReasoningOptions.length > 0 ? (
                settingsReasoningOptions.map((level) => (
                  <option key={level} value={level}>
                    {REASONING_LABELS[level] ?? level}
                  </option>
                ))
              ) : (
                <option value="">Runtime default</option>
              )}
            </select>
            {settingsError?.key === "reasoningEffort" ? (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-danger">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-ink-muted">Higher reasoning uses more tokens but produces more thorough analysis.</p>
            )}
          </label>

          <details className="group rounded-xl bg-surface-low px-[0.9rem] py-[0.55rem]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Trusted skills</span>
                <span className="text-[0.8125rem] leading-[1.4] text-ink-muted">
                  {trustedSkillApprovals.length > 0 ? `${trustedSkillApprovals.length} approved` : "none"}
                </span>
              </div>
              <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-[0.5rem] flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.875rem] leading-[1.6] text-ink-muted">
                  Sense-1 remembers approved skills at the profile level and reuses them across threads and workspaces until the skill changes or you revoke trust.
                </p>
              </div>
              {trustedSkillApprovals.length > 0 ? (
                <Button
                  className="rounded-full"
                  onClick={() => void saveSettings({ trustedSkillApprovals: [] })}
                  size="sm"
                  variant="secondary"
                >
                  Clear all
                </Button>
              ) : null}
            </div>
            {trustedSkillApprovals.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {trustedSkillApprovals.map((entry) => {
                  const skillPath = parseSkillApprovalKey(entry).path ?? entry;
                  const skillName = skillPath.split("/").slice(-2, -1)[0] ?? skillPath;
                  return (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-high px-3 py-2" key={entry}>
                      <div className="min-w-0">
                        <p className="truncate text-[0.875rem] font-medium leading-[1.45] text-ink">{skillName}</p>
                        <p className="truncate text-[0.75rem] leading-[1.5] text-ink-muted">{skillPath}</p>
                      </div>
                      <Button
                        className="shrink-0 rounded-full"
                        onClick={() => removeTrustedSkillApproval(skillPath)}
                        size="sm"
                        variant="secondary"
                      >
                        Revoke
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 text-[0.8125rem] leading-[1.52] text-ink-muted">No skill approvals have been trusted for this profile yet.</p>
            )}
            {settingsError?.key === "trustedSkillApprovals" ? (
              <p className="mt-[0.65rem] text-[0.8125rem] leading-[1.52] text-danger">{settingsError.message}</p>
            ) : null}
          </details>
          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Service tier</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ serviceTier: e.target.value as "flex" | "fast" })}
              value={settingsServiceTier}
            >
              <option value="flex">Flex</option>
              <option value="fast">Fast</option>
            </select>
            {settingsError?.key === "serviceTier" ? (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-danger">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-ink-muted">Fast mode prefers the low-latency service tier for new runs.</p>
            )}
          </label>

          <label className="flex flex-col gap-[0.4rem]">
            <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Codex settings</span>
            <select
              className="rounded-md bg-surface-high px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
              onChange={(e) => void saveSettings({ verbosity: e.target.value as DesktopVerbosity })}
              value={settingsData.verbosity}
            >
              {VERBOSITY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {settingsError?.key === "verbosity" ? (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-danger">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.5] text-ink-muted">
                {VERBOSITY_HELP[settingsData.verbosity]} These settings affect answer length and style, not the model or its capabilities.
              </p>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Loading settings...</p>
      )}
    </>
  );
}
