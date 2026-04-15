import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import { resolveSettingsUpdateSummary } from "../../features/updates/update-presentation.js";
import type { DesktopModelEntry, DesktopSettings, DesktopUpdateState } from "../../../main/contracts";

const REASONING_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
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
  checkForUpdates,
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

  return (
    <>
      <h2 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">General</h2>
      <p className="mt-[0.2rem] text-[0.875rem] leading-[1.6] text-ink-muted">Core desktop defaults for updates, model selection, and reasoning depth.</p>
      {settingsData ? (
        <div className="mt-[1.25rem] flex flex-col gap-[1.25rem]">
          <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.85rem]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Current version</p>
                <p className="mt-[0.35rem] text-[1rem] font-medium leading-[1.45] text-ink">
                  {currentVersion ? `v${currentVersion}` : "Version unavailable"}
                </p>
                <p className={cn("mt-[0.55rem] text-[0.875rem] font-medium leading-[1.6]", updateSummary.isError ? "text-[oklch(65%_0.15_25)]" : "text-ink")}>
                  {updateSummary.title}
                </p>
                <p className="mt-[0.15rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                  {updateSummary.detail}
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
                  Download latest release
                </Button>
                <Button
                  className="rounded-full"
                  disabled={updateState?.phase === "checking" || updateState?.phase === "downloading" || updateState?.phase === "installing"}
                  onClick={() => {
                    void checkForUpdates();
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Check for updates
                </Button>
              </div>
            </div>
          </div>

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
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
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
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">Higher reasoning uses more tokens but produces more thorough analysis.</p>
            )}
          </label>

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
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{settingsError.message}</p>
            ) : (
              <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">Fast mode prefers the low-latency service tier for new runs.</p>
            )}
          </label>
        </div>
      ) : (
        <p className="mt-[1.25rem] text-[0.875rem] leading-[1.6] text-ink-muted">Loading settings...</p>
      )}
    </>
  );
}
