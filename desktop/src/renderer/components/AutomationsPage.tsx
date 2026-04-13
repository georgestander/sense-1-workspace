import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock3, Loader2, Play, Plus, Save, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import type {
  DesktopAutomationDetailResult,
  DesktopAutomationExecutionEnvironment,
  DesktopAutomationRecord,
  DesktopAutomationSaveRequest,
} from "../../main/contracts";
import { AutomationScheduleField } from "./automations/AutomationScheduleField";
import { AutomationWorkspaceField } from "./automations/AutomationWorkspaceField";
import {
  buildAutomationScheduleRrule,
  createDefaultAutomationSchedule,
  isAutomationScheduleEditable,
  normalizeWorkspaceOptions,
  parseAutomationSchedule,
  resolveAutomationSaveRrule,
  type AutomationScheduleDraft,
} from "./automations/automation-form-utils";

type AutomationsPageProps = {
  automations: DesktopAutomationRecord[];
  deleteAutomation: (id: string) => Promise<void>;
  error: string | null;
  loading: boolean;
  projectOptions: string[];
  runAutomationNow: (id: string) => Promise<DesktopAutomationDetailResult | undefined>;
  saveAutomation: (request: DesktopAutomationSaveRequest) => Promise<DesktopAutomationDetailResult>;
  saving: boolean;
  selectedAutomation: DesktopAutomationDetailResult | null;
  selectedAutomationId: string | null;
  setSelectedAutomationId: (id: string | null) => void;
};

type AutomationWorkspaceMode = "recent" | "custom";

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

export function AutomationsPage({
  automations,
  deleteAutomation,
  error,
  loading,
  projectOptions,
  runAutomationNow,
  saveAutomation,
  saving,
  selectedAutomation,
  selectedAutomationId,
  setSelectedAutomationId,
}: AutomationsPageProps) {
  const normalizedWorkspaceOptions = useMemo(() => normalizeWorkspaceOptions(projectOptions), [projectOptions]);
  const [draft, setDraft] = useState<AutomationDraft>(() => createEmptyDraft());
  const [composerVisible, setComposerVisible] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<AutomationWorkspaceMode>(
    normalizedWorkspaceOptions.length > 0 ? "recent" : "custom",
  );

  useEffect(() => {
    setDraft(toDraft(selectedAutomation));
  }, [selectedAutomation]);

  useEffect(() => {
    if (!selectedAutomation) {
      return;
    }

    const cwd = selectedAutomation.automation.cwds[0] ?? "";
    setWorkspaceMode(isRecentWorkspace(cwd, normalizedWorkspaceOptions) ? "recent" : "custom");
    setComposerVisible(true);
  }, [normalizedWorkspaceOptions, selectedAutomation]);

  const isLoadingSelection = Boolean(
    selectedAutomationId && (!selectedAutomation || selectedAutomation.automation.id !== selectedAutomationId),
  );
  const showComposer = composerVisible || Boolean(selectedAutomation) || isLoadingSelection;

  async function handleSave() {
    const detail = await saveAutomation({
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
    setSelectedAutomationId(detail.automation.id);
  }

  function handleNewAutomation() {
    setSelectedAutomationId(null);
    setDraft(createEmptyDraft());
    setWorkspaceMode(normalizedWorkspaceOptions.length > 0 ? "recent" : "custom");
    setComposerVisible(true);
  }

  async function handleDeleteAutomation() {
    if (!draft.id) {
      return;
    }

    await deleteAutomation(draft.id);
    setSelectedAutomationId(null);
    setDraft(createEmptyDraft());
    setWorkspaceMode(normalizedWorkspaceOptions.length > 0 ? "recent" : "custom");
    setComposerVisible(false);
  }

  return (
    <div className="flex h-full min-h-0 bg-canvas">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-line/50 bg-white">
        <div className="border-b border-line/40 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">Automations</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Scheduled work</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Create repeatable automations for local and worktree-based knowledge work.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleNewAutomation} variant="default">
              <Plus />
              New automation
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading && automations.length === 0 ? <p className="rounded-2xl bg-surface-soft px-3 py-2 text-sm text-ink-soft">Loading automations...</p> : null}
          {automations.length === 0 && !loading ? <p className="rounded-2xl bg-surface-soft px-3 py-2 text-sm text-ink-soft">No automations yet. Create one to schedule recurring work.</p> : null}
          <div className="space-y-2">
            {automations.map((automation) => (
              <button
                className={`w-full rounded-2xl px-4 py-3 text-left transition-colors ${selectedAutomationId === automation.id ? "bg-ink text-white" : "bg-surface-soft text-ink hover:bg-surface-strong"}`}
                key={automation.id}
                onClick={() => {
                  setComposerVisible(true);
                  setSelectedAutomationId(automation.id);
                }}
                type="button"
              >
                <p className="text-sm font-medium">{automation.name}</p>
                <p className={`mt-1 text-xs ${selectedAutomationId === automation.id ? "text-white/75" : "text-ink-muted"}`}>
                  {automation.status} · {automation.nextRunAt ? `Next ${new Date(automation.nextRunAt).toLocaleString()}` : "No upcoming run"}
                </p>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {error ? <p className="mb-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{error}</p> : null}

        {!showComposer ? (
          <section className="flex min-h-[calc(100%-1.5rem)] items-center justify-center">
            <div className="max-w-2xl rounded-[2rem] bg-white p-8 shadow-[0_12px_30px_rgba(10,15,20,0.05)]">
              <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-surface-soft text-ink">
                <CalendarClock className="size-6" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.11em] text-muted">Automations</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Plan repeatable work with a calmer editor</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">
                Start with a new automation or select an existing one. The editor stays hidden until you ask for it.
              </p>
              <div className="mt-6">
                <Button onClick={handleNewAutomation} variant="default">
                  <Plus />
                  New automation
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[2rem] bg-white p-6 shadow-[0_12px_30px_rgba(10,15,20,0.05)]">
              {isLoadingSelection ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-[1.75rem] bg-surface-soft">
                  <div className="flex items-center gap-3 text-sm text-ink-muted">
                    <Loader2 className="size-4 animate-spin text-muted" />
                    Loading automation details...
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">{draft.id ? "Edit automation" : "New automation"}</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{draft.name || "Untitled automation"}</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {draft.id ? (
                        <Button disabled={saving} onClick={() => void runAutomationNow(draft.id!)} variant="secondary">
                          <Play />
                          Run now
                        </Button>
                      ) : null}
                      <Button disabled={saving || !draft.name.trim() || !draft.prompt.trim()} onClick={() => void handleSave()} variant="default">
                        <Save />
                        Save
                      </Button>
                      {draft.id ? (
                        <Button disabled={saving} onClick={() => void handleDeleteAutomation()} variant="destructive">
                          <Trash2 />
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Title</span>
                      <input
                        className="rounded-2xl border border-line/40 bg-canvas px-3 py-2 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                        value={draft.name}
                      />
                    </label>

                    <label className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Run target</span>
                      <div className="flex items-center gap-2 rounded-2xl border border-line/40 bg-canvas px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                        <Clock3 className="size-4 shrink-0 text-muted" />
                        <select
                          className="min-w-0 flex-1 bg-transparent outline-none"
                          onChange={(event) => setDraft((current) => ({
                            ...current,
                            executionEnvironment: event.target.value as DesktopAutomationExecutionEnvironment,
                          }))}
                          value={draft.executionEnvironment}
                        >
                          <option value="local">Local</option>
                          <option value="worktree">Worktree</option>
                        </select>
                      </div>
                    </label>

                    <AutomationWorkspaceField
                      mode={workspaceMode}
                      onChange={(value) => setDraft((current) => ({ ...current, cwd: value }))}
                      onModeChange={setWorkspaceMode}
                      options={projectOptions}
                      value={draft.cwd}
                    />

                    <label className="md:col-span-2 mt-1 flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Prompt</span>
                      <textarea
                        className="min-h-[280px] rounded-[1.5rem] border border-line/40 bg-canvas px-4 py-3 text-sm leading-6 text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                        onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                        placeholder="Describe the recurring task clearly enough that it can run without more setup."
                        value={draft.prompt}
                      />
                    </label>

                    <div className="md:col-span-2">
                      <AutomationScheduleField
                        disabled={!draft.scheduleEditable}
                        onChange={(value) => setDraft((current) => ({ ...current, schedule: value }))}
                        value={draft.schedule}
                      />
                    </div>

                    <details className="md:col-span-2 rounded-2xl border border-line/40 bg-canvas px-4 py-3">
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
                            className="rounded-2xl border border-line/40 bg-white px-3 py-2 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                            onChange={(event) => setDraft((current) => ({ ...current, template: event.target.value }))}
                            placeholder="Daily brief, inbox triage, release review..."
                            value={draft.template}
                          />
                        </label>

                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Status</span>
                          <div className="flex items-center gap-2 rounded-2xl border border-line/40 bg-white px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                            <select
                              className="min-w-0 flex-1 bg-transparent outline-none"
                              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as "ACTIVE" | "PAUSED" }))}
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
                            className="rounded-2xl border border-line/40 bg-white px-3 py-2 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30"
                            onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                            value={draft.model}
                          />
                        </label>

                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Reasoning</span>
                          <div className="flex items-center gap-2 rounded-2xl border border-line/40 bg-white px-3 py-2 text-sm text-ink outline-none focus-within:ring-[3px] focus-within:ring-accent/30">
                            <select
                              className="min-w-0 flex-1 bg-transparent outline-none"
                              onChange={(event) => setDraft((current) => ({ ...current, reasoningEffort: event.target.value }))}
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
                  </div>
                </>
              )}
            </section>

            <aside className="rounded-[2rem] bg-white p-6 shadow-[0_12px_30px_rgba(10,15,20,0.05)]">
              <h2 className="text-lg font-semibold text-ink">Recent runs</h2>
              {selectedAutomation?.runs.length ? (
                <div className="mt-4 space-y-3">
                  {selectedAutomation.runs.map((run) => (
                    <article className="rounded-2xl bg-surface-soft px-4 py-3" key={run.id}>
                      <div className="flex items-start gap-2">
                        <Clock3 className="mt-0.5 size-4 text-muted" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{run.status}</p>
                          <p className="mt-1 text-xs text-ink-muted">{new Date(run.startedAt).toLocaleString()}</p>
                          {run.note ? <p className="mt-2 text-xs text-ink-muted">{run.note}</p> : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">
                  {composerVisible
                    ? "Save an automation to see recent runs here."
                    : "Select an automation to inspect its recent runs."}
                </p>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
