import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Save, Trash2, X } from "lucide-react";

import type {
  DesktopAutomationDetailResult,
  DesktopAutomationExecutionEnvironment,
  DesktopAutomationSaveRequest,
} from "../../../main/contracts";
import { Button } from "../ui/button";
import { AutomationScheduleField } from "./AutomationScheduleField";
import { AutomationWorkspaceField } from "./AutomationWorkspaceField";
import {
  AUTOMATION_ALPHA_NOTE,
  AUTOMATION_KIND_LABEL,
  buildAutomationScheduleRrule,
  createDefaultAutomationSchedule,
  isAutomationScheduleEditable,
  normalizeWorkspaceOptions,
  parseAutomationSchedule,
  resolveAutomationSaveRrule,
  type AutomationScheduleDraft,
} from "./automation-form-utils.js";

type AutomationWorkspaceMode = "recent" | "custom";

type AutomationDialogProps = {
  automation: DesktopAutomationDetailResult | null;
  loading: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
  onRunNow: () => Promise<unknown>;
  onSave: (request: DesktopAutomationSaveRequest) => Promise<unknown>;
  projectOptions: string[];
  saving: boolean;
};

type AutomationDraft = {
  id?: string;
  name: string;
  prompt: string;
  status: "ACTIVE" | "PAUSED";
  model: string;
  reasoningEffort: string;
  executionEnvironment: DesktopAutomationExecutionEnvironment;
  cwd: string;
  template: string;
  rrule: string;
  scheduleEditable: boolean;
  schedule: AutomationScheduleDraft;
};

function createEmptyDraft(): AutomationDraft {
  const schedule = createDefaultAutomationSchedule();
  return {
    name: "",
    prompt: "",
    status: "ACTIVE",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    executionEnvironment: "local",
    cwd: "",
    template: "",
    rrule: buildAutomationScheduleRrule(schedule),
    scheduleEditable: true,
    schedule,
  };
}

function toDraft(detail: DesktopAutomationDetailResult | null): AutomationDraft {
  if (!detail) {
    return createEmptyDraft();
  }

  return {
    id: detail.automation.id,
    name: detail.automation.name,
    prompt: detail.automation.prompt,
    status: detail.automation.status,
    model: detail.automation.model,
    reasoningEffort: detail.automation.reasoningEffort,
    executionEnvironment: detail.automation.executionEnvironment,
    cwd: detail.automation.cwds[0] ?? "",
    template: detail.automation.template ?? "",
    rrule: detail.automation.rrule,
    scheduleEditable: isAutomationScheduleEditable(detail.automation.rrule),
    schedule: parseAutomationSchedule(detail.automation.rrule),
  };
}

function isRecentWorkspace(cwd: string, recentWorkspaces: string[]): boolean {
  const trimmed = cwd.trim();
  return Boolean(trimmed) && recentWorkspaces.includes(trimmed);
}

export function AutomationDialog({
  automation,
  loading,
  onClose,
  onDelete,
  onRunNow,
  onSave,
  projectOptions,
  saving,
}: AutomationDialogProps) {
  const normalizedWorkspaceOptions = useMemo(
    () => normalizeWorkspaceOptions(projectOptions),
    [projectOptions],
  );
  const [draft, setDraft] = useState<AutomationDraft>(() => toDraft(automation));
  const [workspaceMode, setWorkspaceMode] = useState<AutomationWorkspaceMode>(() => {
    if (automation) {
      return isRecentWorkspace(automation.automation.cwds[0] ?? "", normalizedWorkspaceOptions)
        ? "recent"
        : "custom";
    }
    return normalizedWorkspaceOptions.length > 0 ? "recent" : "custom";
  });

  useEffect(() => {
    setDraft(toDraft(automation));
    if (automation) {
      setWorkspaceMode(
        isRecentWorkspace(automation.automation.cwds[0] ?? "", normalizedWorkspaceOptions)
          ? "recent"
          : "custom",
      );
    }
  }, [automation, normalizedWorkspaceOptions]);

  const isEditing = Boolean(draft.id);
  const disableSubmit = saving || !draft.name.trim() || !draft.prompt.trim();

  async function handleSave() {
    await onSave({
      id: draft.id,
      name: draft.name,
      prompt: draft.prompt,
      status: draft.status,
      rrule: resolveAutomationSaveRrule(draft.rrule, draft.schedule, draft.scheduleEditable),
      model: draft.model,
      reasoningEffort: draft.reasoningEffort,
      executionEnvironment: draft.executionEnvironment,
      cwds: draft.cwd ? [draft.cwd] : [],
      template: draft.template || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit workspace automation" : "New workspace automation"}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-[1.75rem] border border-line bg-surface-high p-6 shadow-2xl">
        <header className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted">
              {AUTOMATION_KIND_LABEL}
            </p>
            <input
              aria-label="Automation title"
              className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-ink outline-none placeholder:text-ink-soft focus-visible:ring-0"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Automation title"
              value={draft.name}
            />
          </div>
          <Button aria-label="Close" onClick={onClose} size="icon-sm" variant="ghost">
            <X />
          </Button>
        </header>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl bg-surface-soft">
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin text-muted" />
              Loading automation details...
            </div>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Prompt</span>
              <textarea
                className="min-h-[220px] rounded-[1.5rem] border border-line bg-canvas px-4 py-3 text-sm leading-6 text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                placeholder="Describe the recurring task clearly enough that it can run without more setup."
                value={draft.prompt}
              />
            </label>

            <AutomationScheduleField
              disabled={!draft.scheduleEditable}
              onChange={(value) => setDraft((current) => ({ ...current, schedule: value }))}
              value={draft.schedule}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <AutomationWorkspaceField
                mode={workspaceMode}
                onChange={(value) => setDraft((current) => ({ ...current, cwd: value }))}
                onModeChange={setWorkspaceMode}
                options={projectOptions}
                value={draft.cwd}
              />

              <label className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Run target</span>
                <div className="flex items-center gap-2 rounded-2xl border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                  <select
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        executionEnvironment: event.target.value as DesktopAutomationExecutionEnvironment,
                      }))
                    }
                    value={draft.executionEnvironment}
                  >
                    <option value="local">Local</option>
                    <option value="worktree">Worktree</option>
                  </select>
                </div>
              </label>
            </div>

            <details className="rounded-2xl border border-line bg-canvas px-4 py-3">
              <summary className="cursor-pointer select-none text-sm font-medium text-ink">
                Advanced settings
              </summary>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                Template, status, model, and reasoning stay tucked away unless you need them.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Template</span>
                  <input
                    className="rounded-2xl border border-line bg-surface-high px-3 py-2 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                    onChange={(event) => setDraft((current) => ({ ...current, template: event.target.value }))}
                    placeholder="Daily brief, inbox triage, release review..."
                    value={draft.template}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Status</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-high px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                    <select
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          status: event.target.value as "ACTIVE" | "PAUSED",
                        }))
                      }
                      value={draft.status}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                    </select>
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Model</span>
                  <input
                    className="rounded-2xl border border-line bg-surface-high px-3 py-2 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                    onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                    value={draft.model}
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Reasoning</span>
                  <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-high px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                    <select
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, reasoningEffort: event.target.value }))
                      }
                      value={draft.reasoningEffort}
                    >
                      <option value="minimal">Minimal</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="xhigh">Max</option>
                    </select>
                  </div>
                </label>
              </div>
            </details>

            <p className="text-xs leading-5 text-ink-muted">{AUTOMATION_ALPHA_NOTE}</p>

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <Button disabled={saving} onClick={() => void onRunNow()} variant="secondary">
                      <Play />
                      Run now in workspace
                    </Button>
                    <Button disabled={saving} onClick={() => void onDelete()} variant="destructive">
                      <Trash2 />
                      Delete
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onClose} variant="ghost">
                  Cancel
                </Button>
                <Button disabled={disableSubmit} onClick={() => void handleSave()} variant="default">
                  <Save />
                  {isEditing ? "Save" : "Create"}
                </Button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
