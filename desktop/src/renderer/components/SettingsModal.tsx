import { ArrowLeft } from "lucide-react";

import { cn } from "../lib/cn";
import {
  ConfigurationSettingsSection,
  GeneralSettingsSection,
  PersonalizationSettingsSection,
  TeamSettingsSection,
  UsageSettingsSection,
} from "./settings/SettingsSections";
import { BehaviorSettingsSection } from "./settings/BehaviorSettingsSection";
import {
  ArchivedChatsSettingsSection,
  EnvironmentsSettingsSection,
  GitSettingsSection,
  McpServersSettingsSection,
  WorktreesSettingsSection,
} from "./settings/SettingsOverviewSections";
import type {
  DesktopBootstrapTeamSetup,
  DesktopBootstrapTenant,
  DesktopModelEntry,
  DesktopSettings,
  DesktopUpdateState,
} from "../../main/contracts";

const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "team", label: "Team" },
  { id: "configuration", label: "Configuration" },
  { id: "personalization", label: "Personalization" },
  { id: "usage", label: "Usage" },
  { id: "mcp", label: "MCP servers" },
  { id: "git", label: "Git" },
  { id: "environments", label: "Environments" },
  { id: "worktrees", label: "Worktrees" },
  { id: "archived", label: "Archived chats" },
  { id: "behavior", label: "Agent behavior" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export interface SettingsModalProps {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  settingsSection: string;
  setSettingsSection: (section: string) => void;
  settingsData: DesktopSettings | null;
  settingsError: { key: string; message: string } | null;
  settingsSaving: boolean;
  saveSettings: (updates: Partial<DesktopSettings>) => void;
  accountEmail: string | null;
  teamSetup: DesktopBootstrapTeamSetup;
  tenant: DesktopBootstrapTenant | null;
  refreshBootstrap: () => Promise<unknown>;
  modelOptions: string[];
  settingsModel: string;
  settingsReasoning: string;
  settingsReasoningOptions: string[];
  saveSettingsModelSelection: (nextModel: string) => void;
  availableModels: DesktopModelEntry[];
  currentVersion: string | null;
  updateState: DesktopUpdateState | null;
  checkForUpdates: () => Promise<void>;
  openLatestRelease: () => Promise<void>;
}

export function SettingsModal({
  settingsOpen,
  setSettingsOpen,
  settingsSection,
  setSettingsSection,
  settingsData,
  settingsError,
  settingsSaving,
  saveSettings,
  accountEmail,
  teamSetup,
  tenant,
  refreshBootstrap,
  modelOptions,
  settingsModel,
  settingsReasoning,
  settingsReasoningOptions,
  saveSettingsModelSelection,
  availableModels,
  currentVersion,
  updateState,
  checkForUpdates,
  openLatestRelease,
}: SettingsModalProps) {
  if (!settingsOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-surface-glass px-4 backdrop-blur-[12px]">
        <button
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.875rem] leading-[1.6] text-ink-faint transition-colors hover:bg-surface-low hover:text-ink"
          onClick={() => setSettingsOpen(false)}
          type="button"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h1 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">Settings</h1>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="w-[260px] shrink-0 overflow-y-auto bg-surface-low p-[0.9rem]">
          <div className="flex flex-col gap-[0.2rem]">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                className={cn(
                  "rounded-md px-[0.65rem] py-[0.4rem] text-left text-[0.875rem] leading-[1.6] transition-colors",
                  settingsSection === section.id
                    ? "bg-surface-high font-medium text-ink"
                    : "text-ink-faint hover:bg-surface hover:text-ink",
                )}
                key={section.id}
                onClick={() => setSettingsSection(section.id)}
                type="button"
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto bg-surface">
          <div className="fade-up mx-auto max-w-2xl px-10 py-[1.75rem]">
            {settingsSection === "general" ? (
              <GeneralSettingsSection
                availableModels={availableModels}
                checkForUpdates={checkForUpdates}
                currentVersion={currentVersion}
                modelOptions={modelOptions}
                openLatestRelease={openLatestRelease}
                saveSettings={saveSettings}
                saveSettingsModelSelection={saveSettingsModelSelection}
                settingsData={settingsData}
                settingsError={settingsError}
                settingsModel={settingsModel}
                settingsReasoning={settingsReasoning}
                settingsReasoningOptions={settingsReasoningOptions}
                updateState={updateState}
              />
            ) : settingsSection === "team" ? (
              <TeamSettingsSection
                accountEmail={accountEmail}
                refreshBootstrap={refreshBootstrap}
                teamSetup={teamSetup}
                tenant={tenant}
              />
            ) : settingsSection === "configuration" ? (
              <ConfigurationSettingsSection
                saveSettings={saveSettings}
                settingsData={settingsData}
                settingsError={settingsError}
              />
            ) : settingsSection === "personalization" ? (
              <PersonalizationSettingsSection
                saveSettings={saveSettings}
                settingsData={settingsData}
                settingsError={settingsError}
              />
            ) : settingsSection === "usage" ? (
              <UsageSettingsSection
                saveSettings={saveSettings}
                settingsData={settingsData}
                settingsError={settingsError}
              />
            ) : settingsSection === "mcp" ? (
              <McpServersSettingsSection />
            ) : settingsSection === "git" ? (
              <GitSettingsSection />
            ) : settingsSection === "environments" ? (
              <EnvironmentsSettingsSection />
            ) : settingsSection === "worktrees" ? (
              <WorktreesSettingsSection />
            ) : settingsSection === "archived" ? (
              <ArchivedChatsSettingsSection />
            ) : settingsSection === "behavior" ? (
              <BehaviorSettingsSection
                settingsOpen={settingsOpen}
                settingsSection={settingsSection}
              />
            ) : null}
            {settingsSaving ? (
              <p className="mt-6 text-xs uppercase tracking-[0.08em] text-muted">Saving settings...</p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
