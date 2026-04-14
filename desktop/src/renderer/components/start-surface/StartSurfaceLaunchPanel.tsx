import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, ChevronRight, Clock3, Folder, FolderOpen, Mic, MicOff, Paperclip, Send } from "lucide-react";

import { Button } from "../ui/button";
import { ShortcutPillRow } from "../composer/shortcut-pill-row.js";
import { ShortcutSuggestionMenu } from "../composer/shortcut-suggestion-menu.js";
import { Input } from "../ui/input";
import { cn } from "../../lib/cn";
import type { DesktopBootstrapTeamSetup, DesktopBootstrapTenant, DesktopExtensionOverviewResult, DesktopModelEntry, DesktopThreadSnapshot, ProjectedSessionRecord, ProjectedWorkspaceRecord } from "../../../main/contracts";
import type { FolderOption } from "../../state/session/session-types.js";
import { folderDisplayName } from "../../state/session/session-selectors.js";
import { buildStartSurfaceIdentity } from "../../state/session/tenant-identity.js";
import { useComposerDictation } from "../../features/session/use-composer-dictation.js";
import { formatSessionActivity, isResumableProjectedSession, workspaceDisplayName } from "./start-surface-utils.js";
import { replaceActivePromptShortcut, resolvePromptShortcutSuggestions } from "../../../shared/prompt-shortcuts.ts";

export type StartSurfaceLaunchPanelProps = {
  accountEmail: string | null;
  tenant: DesktopBootstrapTenant | null;
  teamSetup: DesktopBootstrapTeamSetup;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  draftPrompt: string;
  setDraftPrompt: (value: string) => void;
  workInFolder: boolean;
  setWorkInFolder: (value: boolean) => void;
  workspaceFolder: string | null;
  setWorkspaceFolder: (value: string | null) => void;
  folderMenuOpen: boolean;
  setFolderMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  attachedFiles: string[];
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  pickFiles: () => Promise<string[]>;
  selectedModel: string | null;
  handleModelSelection: (nextModel: string) => void;
  modelOptions: string[];
  availableModels: DesktopModelEntry[];
  submitDraftTask: () => void;
  activeWorkspaceProjection: ProjectedWorkspaceRecord | null;
  workspaceSessions: ProjectedSessionRecord[];
  workspaceSessionsLoading: boolean;
  pickRecentFolder: (path: string) => void;
  chooseDifferentFolder: () => void;
  resumeWorkspaceSession: (session: ProjectedSessionRecord, workspaceRoot: string | null) => Promise<void>;
  recentFolders: FolderOption[];
  threads: DesktopThreadSnapshot[];
  pendingPermission: {
    rootPath: string;
    displayName: string;
    originalRequest: { prompt: string; threadId?: string | null; workspaceRoot?: string | null };
  } | null;
  grantWorkspacePermission: (mode: "once" | "always") => void;
  cancelWorkspacePermission: () => void;
  taskPending: boolean;
  taskError: string | null;
  refreshBootstrap: () => Promise<unknown>;
};

export function StartSurfaceLaunchPanel(props: StartSurfaceLaunchPanelProps) {
  const {
    accountEmail,
    tenant,
    teamSetup,
    extensionOverview,
    draftPrompt,
    setDraftPrompt,
    workInFolder,
    setWorkInFolder,
    workspaceFolder,
    setWorkspaceFolder,
    folderMenuOpen,
    setFolderMenuOpen,
    attachedFiles,
    setAttachedFiles,
    pickFiles,
    selectedModel,
    handleModelSelection,
    modelOptions,
    availableModels,
    submitDraftTask,
    activeWorkspaceProjection,
    workspaceSessions,
    workspaceSessionsLoading,
    pickRecentFolder,
    chooseDifferentFolder,
    resumeWorkspaceSession,
    recentFolders,
    threads,
    pendingPermission,
    grantWorkspacePermission,
    cancelWorkspacePermission,
    taskPending,
    taskError,
    refreshBootstrap,
  } = props;
  const [teamName, setTeamName] = useState("");
  const [teamPending, setTeamPending] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [shortcutCursorIndex, setShortcutCursorIndex] = useState(draftPrompt.length);
  const [shortcutSelectionIndex, setShortcutSelectionIndex] = useState(0);
  const promptInputRef = useRef<HTMLInputElement | null>(null);

  const resumableWorkspaceSessions = workspaceSessions.filter(isResumableProjectedSession);
  const primaryWorkspaceSession = resumableWorkspaceSessions[0] ?? null;
  const teamIdentity = buildStartSurfaceIdentity({
    accountEmail,
    tenant,
    teamSetup,
    recentFolderCount: recentFolders.length,
    threadCount: threads.length,
  });
  const canStartWork = teamIdentity.canStartWork;
  const dictation = useComposerDictation({
    enabled: canStartWork,
    value: draftPrompt,
    setValue: (value) => setDraftPrompt(typeof value === "function" ? value(draftPrompt) : value),
  });
  const shortcutSuggestions = useMemo(
    () => (extensionOverview ? resolvePromptShortcutSuggestions(draftPrompt, extensionOverview, shortcutCursorIndex) : []),
    [draftPrompt, extensionOverview, shortcutCursorIndex],
  );
  const visibleShortcutSuggestions = shortcutSuggestions.slice(0, 8);

  useEffect(() => {
    setShortcutSelectionIndex(0);
  }, [draftPrompt, shortcutCursorIndex, shortcutSuggestions.length]);

  function applyShortcutSuggestion(token: string) {
    const nextSelection = replaceActivePromptShortcut(
      draftPrompt,
      token,
      promptInputRef.current?.selectionStart ?? shortcutCursorIndex,
    );
    setDraftPrompt(nextSelection.prompt);
    setShortcutCursorIndex(nextSelection.cursorIndex);
    setShortcutSelectionIndex(0);
    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.setSelectionRange(nextSelection.cursorIndex, nextSelection.cursorIndex);
    });
  }

  async function handleCreateFirstTeam(): Promise<void> {
    const bridge = window.sense1Desktop;
    if (!bridge?.team?.createFirstTeam) {
      setTeamError("Desktop team setup is not available in this build.");
      return;
    }

    setTeamPending(true);
    setTeamError(null);
    try {
      await bridge.team.createFirstTeam({ name: teamName });
      setTeamName("");
      await refreshBootstrap();
    } catch (error) {
      setTeamError(error instanceof Error ? error.message : "Could not create the first team.");
    } finally {
      setTeamPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-5 py-8 lg:px-10 lg:py-12">
      {workInFolder && workspaceFolder ? (
        <div className="shrink-0 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">New thread in</p>
          <h1 className="font-display mt-1 flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight">
            <FolderOpen className="size-5 text-accent" />
            {folderDisplayName(workspaceFolder)}
          </h1>
          <button className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-ink" onClick={() => { setWorkInFolder(false); setWorkspaceFolder(null); }} type="button">Back to home</button>
        </div>
      ) : (
        <div className="shrink-0 text-center">
          <h1 className="font-display text-balance text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.015em] lg:text-[2rem] lg:leading-[1.2] lg:tracking-[-0.02em]">
            {teamIdentity.heading}
          </h1>
          <p className="mx-auto mt-[0.65rem] max-w-lg text-[1rem] leading-[1.6] text-ink-faint">{teamIdentity.supportingCopy}</p>
          {tenant ? (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-ink">Team · {tenant.displayName}</span>
              <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-ink">Role · {teamIdentity.roleLabel}</span>
              <span className="rounded-full bg-surface-soft px-3 py-1 text-xs font-medium text-ink">Scope · {teamIdentity.scopeLabel}</span>
            </div>
          ) : (
            <div className="mx-auto mt-4 max-w-2xl rounded-2xl bg-surface-soft px-4 py-3 text-left">
              <p className="text-[0.75rem] font-semibold uppercase tracking-[0.11em] text-muted">{teamIdentity.statusTitle}</p>
              <p className="mt-2 text-sm leading-6 text-ink-soft">{teamIdentity.statusBody}</p>
              {teamIdentity.canCreateFirstTeam ? (
                <div className="mt-4 rounded-xl bg-white p-3 shadow-[0_10px_24px_rgba(10,15,20,0.05)]">
                  <p className="text-sm font-medium text-ink">Create your first team</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    This creates a desktop-local team record and makes you the admin for this profile.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      disabled={teamPending}
                      onChange={(event) => setTeamName(event.target.value)}
                      placeholder="e.g. Sense-1"
                      value={teamName}
                    />
                    <Button
                      disabled={teamPending || !teamName.trim()}
                      onClick={() => void handleCreateFirstTeam()}
                      variant="default"
                    >
                      {teamPending ? "Creating..." : "Create team"}
                    </Button>
                  </div>
                  {teamError ? <p className="mt-2 text-xs text-[oklch(65%_0.15_25)]">{teamError}</p> : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {pendingPermission ? (
        <article className="mx-auto mt-6 w-full max-w-3xl rounded-2xl bg-surface-high p-[1.25rem]">
          <div className="flex items-center gap-2">
            <Folder className="size-4 text-ink" />
            <p className="text-[0.75rem] font-medium uppercase tracking-[0.05em] text-ink-muted">Workspace access</p>
          </div>
          <p className="mt-[0.65rem] text-[1rem] leading-[1.6] text-ink">
            Allow sense-1 to read <span className="font-semibold">{pendingPermission.displayName}</span>?
          </p>
          <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.52] text-ink-muted">{pendingPermission.rootPath}</p>
          <div className="mt-[0.9rem] flex items-center gap-[0.4rem]">
            <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => void grantWorkspacePermission("always")} size="sm">Allow always</Button>
            <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => void grantWorkspacePermission("once")} size="sm">Allow this time</Button>
            <Button className="rounded-md bg-ink text-canvas hover:bg-ink/90" onClick={() => cancelWorkspacePermission()} size="sm">Cancel</Button>
          </div>
        </article>
      ) : null}

      <section className="relative mx-auto mt-8 w-full max-w-3xl shrink-0 rounded-2xl bg-white p-3 shadow-[0_14px_32px_rgba(10,15,20,0.06)]">
        {taskError ? <p className="mb-3 rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft" role="alert">{taskError}</p> : null}
        {!(workInFolder && workspaceFolder) ? (
          <div className="mb-3 flex flex-wrap gap-2">
            <Button disabled={!canStartWork} onClick={() => { setWorkInFolder(false); setFolderMenuOpen(false); }} variant={!workInFolder ? "default" : "secondary"}>Start chatting</Button>
            <Button disabled={!canStartWork} onClick={() => { setWorkInFolder(true); setFolderMenuOpen(true); }} variant={workInFolder ? "default" : "secondary"}>Choose folder</Button>
          </div>
        ) : null}
        {visibleShortcutSuggestions.length > 0 ? (
          <div className="mb-3">
            <ShortcutSuggestionMenu
              activeIndex={shortcutSelectionIndex}
              onSelect={(suggestion) => applyShortcutSuggestion(suggestion.token)}
              suggestions={visibleShortcutSuggestions}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Input
            autoFocus={Boolean(workInFolder && workspaceFolder && canStartWork)}
            disabled={!canStartWork}
            onChange={(event) => {
              setDraftPrompt(event.target.value);
              setShortcutCursorIndex(event.target.selectionStart ?? event.target.value.length);
            }}
            onClick={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
            onKeyUp={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
            onKeyDown={(event) => {
              if (visibleShortcutSuggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setShortcutSelectionIndex((current) => (current + 1) % visibleShortcutSuggestions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setShortcutSelectionIndex((current) => (current - 1 + visibleShortcutSuggestions.length) % visibleShortcutSuggestions.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  applyShortcutSuggestion(visibleShortcutSuggestions[shortcutSelectionIndex]?.token ?? visibleShortcutSuggestions[0]?.token ?? "");
                  return;
                }
                if (event.key === "Escape") {
                  setShortcutSelectionIndex(0);
                }
              }
              if (event.key !== "Enter") return;
              event.preventDefault();
              submitDraftTask();
            }}
            placeholder={canStartWork ? "How can I help you today?" : "Sign in with ChatGPT to start working."}
            ref={promptInputRef}
            value={draftPrompt}
          />
          <Button
            aria-label={dictation.active ? "Stop voice dictation" : "Start voice dictation"}
            disabled={!dictation.supported || !canStartWork}
            onClick={() => dictation.toggle()}
            size="icon"
            variant="secondary"
          >
            {dictation.active ? <MicOff /> : <Mic />}
          </Button>
          <Button aria-label="Send prompt" disabled={!canStartWork || taskPending || !draftPrompt.trim() || (workInFolder && !workspaceFolder)} onClick={submitDraftTask} size="icon" variant="default"><Send /></Button>
        </div>
        <ShortcutPillRow className="mt-3" overview={extensionOverview} prompt={draftPrompt} />
        {dictation.error ? <p className="mt-2 text-xs text-ink-muted">{dictation.error}</p> : null}
        {attachedFiles.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {attachedFiles.map((filePath) => {
              const name = filePath.split(/[\\/]/).at(-1) ?? filePath;
              return (
                <span className="inline-flex items-center gap-1 rounded-lg bg-surface-soft px-2 py-1 text-xs text-ink-faint" key={filePath}>
                  <Paperclip className="size-3" />
                  {name}
                  <button aria-label={`Remove ${name}`} className="ml-0.5 text-ink-muted hover:text-ink" onClick={() => setAttachedFiles((current) => current.filter((p) => p !== filePath))} type="button">&times;</button>
                </span>
              );
            })}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button aria-label="Add local files" disabled={!canStartWork} onClick={async () => { const paths = await pickFiles(); if (paths.length > 0) setAttachedFiles((current) => [...new Set([...current, ...paths])]); }} size="icon" variant="secondary"><Paperclip /></Button>
          <label className="inline-flex items-center gap-2 rounded-xl border border-line/40 px-2.5 py-1.5 text-xs text-muted">
            <input checked={workInFolder} className="size-3.5 accent-ink" disabled={!canStartWork} onChange={(event) => { const checked = event.target.checked; setWorkInFolder(checked); setFolderMenuOpen(checked); }} type="checkbox" />
            Keep this task bound to a folder
          </label>
          <div className="inline-flex items-center gap-2 rounded-xl border border-line/40 px-2 py-1.5 text-xs text-muted">
            <span>Model</span>
            <select className="bg-transparent text-ink outline-none" disabled={!canStartWork || modelOptions.length === 0} onChange={(event) => handleModelSelection(event.target.value)} value={selectedModel || ""}>
              {modelOptions.length > 0 ? modelOptions.map((option) => (
                <option key={option} value={option}>{availableModels.find((m) => m.id === option)?.name ?? option}</option>
              )) : <option value="">Loading live models...</option>}
            </select>
          </div>
        </div>

        {workInFolder ? (
          <div className="relative z-30 mt-3 pt-3">
            <button aria-controls="folder-menu-options" aria-expanded={folderMenuOpen} className="flex w-full items-center justify-between rounded-xl bg-surface-soft px-3 py-2 text-left text-sm text-ink outline-none transition-all hover:bg-surface-strong focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" onClick={() => setFolderMenuOpen((value) => !value)} type="button">
                <span className="inline-flex min-w-0 items-center gap-2">
                <Folder className="size-4 shrink-0 text-muted" />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="max-w-full truncate">{workspaceFolder ? recentFolders.find((folder) => folder.path === workspaceFolder)?.name ?? folderDisplayName(workspaceFolder) : "Choose a folder"}</span>
                  {workspaceFolder ? <span className="max-w-full truncate text-xs text-muted">{workspaceFolder}</span> : null}
                </span>
              </span>
              <ChevronDown className={cn("size-4 text-muted transition-transform", folderMenuOpen ? "rotate-180" : "")} />
            </button>
            {folderMenuOpen ? (
              <div className="relative z-40 mt-2 rounded-xl bg-white p-2 shadow-[0_20px_40px_-10px_rgba(10,15,20,0.1)]" id="folder-menu-options">
                <button className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink outline-none transition-all hover:bg-surface-soft focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" onClick={chooseDifferentFolder} type="button">
                  <FolderOpen className="size-4 text-muted" />
                  Choose a different folder
                </button>
                <p className="px-2 py-1 text-xs uppercase tracking-[0.11em] text-muted">Previously used folders</p>
                <div className="max-h-48 overflow-y-auto">
                  {recentFolders.length === 0 ? (
                    <p className="rounded-lg bg-surface-soft px-2 py-2 text-sm text-muted">No folders yet. Choose one to start working from your Mac.</p>
                  ) : (
                    recentFolders.map((folder) => (
                      <button className="w-full rounded-lg px-2 py-2 text-left outline-none transition-all hover:bg-surface-soft focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" key={folder.path} onClick={() => pickRecentFolder(folder.path)} type="button">
                        <p className="text-sm font-medium text-ink">{folder.name}</p>
                        <p className="truncate text-xs text-muted">{folder.path}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {workInFolder && workspaceFolder && activeWorkspaceProjection ? (
          <div className="mt-3 rounded-2xl bg-surface-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">Continue this workspace</p>
                <p className="mt-1 truncate text-sm font-medium text-ink">{workspaceDisplayName(activeWorkspaceProjection)}</p>
                <p className="mt-1 text-xs text-muted">Resume a saved session below or keep typing to start a fresh thread in this folder.</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] text-muted">{activeWorkspaceProjection.session_count} {activeWorkspaceProjection.session_count === 1 ? "session" : "sessions"}</span>
            </div>
            {workspaceSessionsLoading ? (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-muted">Loading saved workspace sessions...</p>
            ) : primaryWorkspaceSession ? (
              <div className="mt-3 space-y-2">
                <button className="flex w-full items-start justify-between gap-3 rounded-xl bg-white px-3 py-3 text-left outline-none transition-all hover:bg-surface-strong focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" onClick={() => void resumeWorkspaceSession(primaryWorkspaceSession, activeWorkspaceProjection.root_path)} type="button">
                  <span className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted">Resume latest session</p>
                    <p className="mt-1 truncate text-sm font-medium text-ink">{primaryWorkspaceSession.title || "Untitled session"}</p>
                    <p className="mt-1 text-xs text-muted">
                      {formatSessionActivity(primaryWorkspaceSession.last_activity_at || primaryWorkspaceSession.started_at)}
                      {primaryWorkspaceSession.file_change_count > 0 ? ` · ${primaryWorkspaceSession.file_change_count} ${primaryWorkspaceSession.file_change_count === 1 ? "file change" : "file changes"}` : ""}
                    </p>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted" />
                </button>
                {resumableWorkspaceSessions.length > 1 ? (
                  <div className="space-y-1.5">
                    {resumableWorkspaceSessions.slice(1, 4).map((session) => (
                      <button className="flex w-full items-start gap-2 rounded-xl bg-white/70 px-3 py-2 text-left outline-none transition-all hover:bg-white focus-visible:ring-[3px] focus-visible:ring-accent/30 motion-reduce:transition-none" key={session.session_id} onClick={() => void resumeWorkspaceSession(session, activeWorkspaceProjection.root_path)} type="button">
                        <Clock3 className="mt-0.5 size-4 shrink-0 text-muted" />
                        <span className="min-w-0">
                          <p className="truncate text-sm text-ink">{session.title || "Untitled session"}</p>
                          <p className="text-xs text-muted">{formatSessionActivity(session.last_activity_at || session.started_at)}</p>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-muted">No saved sessions for this workspace yet. Your next prompt will start one here.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
