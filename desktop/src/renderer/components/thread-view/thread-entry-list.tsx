import { memo, useDeferredValue, useRef, useState } from "react";
import { Blocks, Check, ChevronRight, Copy, PlugZap, Sparkles } from "lucide-react";

import { ThreadMarkdown } from "../../thread-markdown.js";
import {
  coerceDisplayText,
  describeCommandExecution,
  firstLinePreview,
  groupThreadEntries,
  isCompletedStatus,
  isThreadEntryRunning,
  reuseGroupedThreadEntries,
  resolveFileChangeTarget,
  summarizeCommand,
  summarizeWorkLogEntry,
  type ThreadGroupedEntry,
} from "./thread-view-utils.js";
import { type DesktopThreadEntry } from "../../lib/live-thread-data.js";
import { getFileIcon, getFileLabel } from "../../lib/file-icons";
import { resolveWorkspaceFilePath } from "../right-rail/RightRailSection";
import { useStreamingEntryBody } from "../../state/session/session-stream-live-bodies.ts";
import type { DesktopExtensionOverviewResult } from "../../../main/contracts";
import { stripResolvedPromptShortcutText } from "../../../shared/prompt-shortcuts.ts";
import { buildStreamingAssistantPreview } from "./streaming-assistant-preview.js";

type ThreadEntryListProps = {
  entries: DesktopThreadEntry[];
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  suppressFileChanges?: boolean;
  threadId: string;
  threadBusy?: boolean;
  onOpenInternalBrowser?: (url: string) => void;
  workspaceRoot: string | null;
};

function fileBasename(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function fileRelativePath(filePath: string, workspaceRoot: string | null): string {
  if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
    const relativePath = filePath.slice(workspaceRoot.length).replace(/^[\\/]/, "");
    return relativePath || filePath;
  }

  return filePath;
}

function openThreadFile(filePath: string, workspaceRoot: string | null) {
  const bridge = window.sense1Desktop;
  if (bridge?.workspace?.openFilePath) {
    void bridge.workspace.openFilePath(resolveWorkspaceFilePath(filePath, workspaceRoot));
  }
}

function EntryCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error(
        `[thread-view] Failed to copy assistant output: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <button
      aria-label={copied ? "Copied response" : "Copy response"}
      className="inline-flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
      onClick={() => void handleCopy()}
      title={copied ? "Copied" : "Copy response"}
      type="button"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function ThreadEntryShortcutPills({
  matches,
}: {
  matches: Array<{
    kind: "app" | "plugin" | "skill";
    label: string;
    token: string;
  }>;
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {matches.map((match) => {
        const Icon = match.kind === "app" ? Blocks : match.kind === "plugin" ? PlugZap : Sparkles;
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[0.6875rem] font-semibold text-canvas shadow-[var(--shadow-raised)]"
            key={`${match.kind}:${match.token}:${match.label}`}
            title={`$${match.token} -> ${match.label}`}
          >
            <Icon className="size-3.5 text-canvas/80" />
            <span className="font-bold">{match.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function ThreadEntryAttachmentPills({
  attachments,
  workspaceRoot,
}: {
  attachments: Array<{
    kind: "file" | "image";
    label: string;
    path: string;
  }>;
  workspaceRoot: string | null;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {attachments.map((attachment) => {
        const Icon = getFileIcon(attachment.label);
        return (
          <button
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--thread-attachment-pill-surface)] px-3 py-1 text-[0.6875rem] font-medium text-[var(--thread-attachment-pill-ink)] shadow-[var(--shadow-raised)] transition-colors hover:bg-[var(--thread-attachment-pill-surface-hover)]"
            key={`${attachment.path}:${attachment.kind}`}
            onClick={() => openThreadFile(attachment.path, workspaceRoot)}
            title={attachment.path}
            type="button"
          >
            <Icon className="size-3.5 shrink-0 text-[var(--thread-attachment-pill-ink-muted)]" />
            <span className="truncate">{attachment.label}</span>
            <span className="shrink-0 text-[var(--thread-attachment-pill-ink-muted)]">{attachment.kind === "image" ? "Image" : getFileLabel(attachment.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ActivityGroupCard({
  extensionOverview,
  forceOpen = false,
  group,
  onOpenInternalBrowser,
  suppressFileChanges = false,
  threadId,
  workspaceRoot,
}: {
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  forceOpen?: boolean;
  group: Extract<ThreadGroupedEntry, { kind: "activity-group" }>;
  onOpenInternalBrowser?: (url: string) => void;
  suppressFileChanges?: boolean;
  threadId: string;
  workspaceRoot: string | null;
}) {
  const runningCount = group.entries.filter(isThreadEntryRunning).length;
  const allCompleted = group.entries.every((entry) => {
    if (!("status" in entry)) {
      return true;
    }
    return isCompletedStatus(entry.status);
  });
  const shouldOpen = group.isRunning || forceOpen;
  const summaryLabel = shouldOpen ? group.latestLabel : (group.durationLabel ?? group.latestLabel);
  const statusLabel = shouldOpen ? (runningCount > 0 ? `${runningCount} running` : "working") : allCompleted ? "" : "stopped";
  const visibleEntries = group.entries.filter((entry) => {
    if (entry.kind === "reasoning") {
      return false;
    }
    return !(suppressFileChanges && entry.kind === "fileChange");
  });

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <article className="px-4 py-1.5" key={group.id}>
      <details className="group" key={`${group.id}:${shouldOpen ? "open" : "closed"}`} open={shouldOpen ? true : undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            {!shouldOpen && allCompleted ? (
              <Check className="size-3 shrink-0 text-accent" />
            ) : (
              <span className="relative flex size-3 shrink-0 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-20" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
            )}
            <p className="truncate text-ink-muted">{summaryLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {statusLabel ? <span className="text-[0.6875rem] text-ink-muted">{statusLabel}</span> : null}
            <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
          </div>
        </summary>
        <div className="mt-1.5 space-y-0.5 pl-5">
          {visibleEntries.map((entry) => (
            <WorkLogEntryCard
              entry={entry}
              extensionOverview={extensionOverview}
              key={entry.id}
              onOpenInternalBrowser={onOpenInternalBrowser}
              threadId={threadId}
              workspaceRoot={workspaceRoot}
            />
          ))}
        </div>
      </details>
    </article>
  );
}

function WorkLogCommentaryEntry({
  entry,
  onOpenInternalBrowser,
  threadId,
  workspaceRoot,
}: {
  entry: DesktopThreadEntry & { kind: "assistant"; body: string; phase?: string; status?: string };
  onOpenInternalBrowser?: (url: string) => void;
  threadId: string;
  workspaceRoot: string | null;
}) {
  const liveStreamingBody = useStreamingEntryBody(threadId, entry.id);
  const entryBody = typeof liveStreamingBody === "string" ? liveStreamingBody : coerceDisplayText(entry.body);
  const deferredEntryBody = useDeferredValue(entryBody);
  const body = entry.status === "streaming" ? deferredEntryBody : entryBody;

  if (!body.trim()) {
    return null;
  }

  return (
    <article className="px-4 py-1.5 text-sm leading-[1.65] text-ink">
      <ThreadMarkdown onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>{body}</ThreadMarkdown>
    </article>
  );
}

function isCommentaryAssistantEntry(
  entry: DesktopThreadEntry,
): entry is DesktopThreadEntry & { kind: "assistant"; body: string; phase: "commentary"; status?: string } {
  return entry.kind === "assistant" && "phase" in entry && entry.phase === "commentary";
}

function renderWorkLogEntryDetails(entry: DesktopThreadEntry, workspaceRoot: string | null, onOpenInternalBrowser?: (url: string) => void) {
  const body = "body" in entry ? coerceDisplayText(entry.body).trim() : "";

  if (entry.kind === "command") {
    return (
      <div className="space-y-1.5">
        <p className="rounded bg-surface-soft px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink">{coerceDisplayText(entry.command, "Command execution")}</p>
        {body ? (
          <pre className="max-h-48 overflow-auto rounded-lg bg-surface-soft px-3 py-2 text-xs whitespace-pre-wrap text-ink">{body}</pre>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "tool") {
    if (!body || body === "Sense-1 used a connected tool.") {
      return null;
    }
    return (
      <ThreadMarkdown className="text-xs text-ink-soft" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
        {body}
      </ThreadMarkdown>
    );
  }

  if (entry.kind === "fileChange") {
    if (entry.changes.length === 0) {
      return null;
    }
    return (
      <div className="space-y-1">
        {entry.changes.map((change, index) => (
          <p className="truncate rounded bg-surface-soft px-2.5 py-1.5 text-xs text-ink" key={`${entry.id}-work-log-change-${index.toString()}`}>
            {coerceDisplayText(change.kind, "changed")}: {coerceDisplayText(change.path, "Unknown path")}
          </p>
        ))}
      </div>
    );
  }

  if (!body) {
    return null;
  }

  return (
    <ThreadMarkdown className="text-xs text-ink-soft" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
      {body}
    </ThreadMarkdown>
  );
}

function WorkLogEntryCard({
  entry,
  onOpenInternalBrowser,
  threadId,
  workspaceRoot,
}: {
  entry: DesktopThreadEntry;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  onOpenInternalBrowser?: (url: string) => void;
  threadId: string;
  workspaceRoot: string | null;
}) {
  if (isCommentaryAssistantEntry(entry)) {
    return <WorkLogCommentaryEntry entry={entry} onOpenInternalBrowser={onOpenInternalBrowser} threadId={threadId} workspaceRoot={workspaceRoot} />;
  }

  const isRunning = isThreadEntryRunning(entry);
  const detail = renderWorkLogEntryDetails(entry, workspaceRoot, onOpenInternalBrowser);

  if (!detail) {
    return (
      <article className="px-4 py-1 text-xs text-ink-muted">
        <div className="flex items-center justify-between gap-2">
          <span>{summarizeWorkLogEntry(entry)}</span>
          {isRunning ? <span className="shrink-0 text-[0.6875rem] text-ink-faint">running</span> : null}
        </div>
      </article>
    );
  }

  return (
    <article className="px-4 py-1 text-xs text-ink-muted">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span>{summarizeWorkLogEntry(entry)}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {isRunning ? <span className="text-[0.6875rem] text-ink-faint">running</span> : null}
            <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
          </span>
        </summary>
        <div className="mt-1 pl-2">
          {detail}
        </div>
      </details>
    </article>
  );
}

function areThreadEntryCardPropsEqual(
  previousProps: {
    entry: DesktopThreadEntry;
    extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
    onOpenInternalBrowser?: (url: string) => void;
    threadId: string;
    workspaceRoot: string | null;
  },
  nextProps: {
    entry: DesktopThreadEntry;
    extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
    onOpenInternalBrowser?: (url: string) => void;
    threadId: string;
    workspaceRoot: string | null;
  },
): boolean {
  return previousProps.entry === nextProps.entry
    && previousProps.threadId === nextProps.threadId
    && previousProps.workspaceRoot === nextProps.workspaceRoot
    && previousProps.onOpenInternalBrowser === nextProps.onOpenInternalBrowser
    && (
      previousProps.entry.kind !== "user"
      || previousProps.extensionOverview === nextProps.extensionOverview
    );
}

const ThreadEntryCard = memo(function ThreadEntryCard({
  entry,
  extensionOverview,
  onOpenInternalBrowser,
  threadId,
  workspaceRoot,
}: {
  entry: DesktopThreadEntry;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  onOpenInternalBrowser?: (url: string) => void;
  threadId: string;
  workspaceRoot: string | null;
}) {
  const liveStreamingBody = useStreamingEntryBody(threadId, entry.id);
  const entryBody =
    typeof liveStreamingBody === "string"
      ? liveStreamingBody
      : "body" in entry
        ? coerceDisplayText(entry.body)
        : "";
  const deferredEntryBody = useDeferredValue(entryBody);
  const visibleUserBody = entry.kind === "user" && extensionOverview
    ? stripResolvedPromptShortcutText(entryBody, extensionOverview)
    : entryBody;

  if (entry.kind === "user") {
    return (
      <article className="user-bubble ml-auto w-full max-w-[78%] rounded-xl px-3 py-2 text-[0.8125rem]">
        {"promptShortcuts" in entry && Array.isArray(entry.promptShortcuts) && entry.promptShortcuts.length > 0 ? (
          <ThreadEntryShortcutPills matches={entry.promptShortcuts} />
        ) : null}
        {"attachments" in entry && Array.isArray(entry.attachments) && entry.attachments.length > 0 ? (
          <ThreadEntryAttachmentPills attachments={entry.attachments} workspaceRoot={workspaceRoot} />
        ) : null}
        <ThreadMarkdown className="thread-markdown-user" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
          {visibleUserBody}
        </ThreadMarkdown>
      </article>
    );
  }

  if (entry.kind === "assistant") {
    const isStreamingAssistant = "status" in entry && entry.status === "streaming";
    const assistantBody = isStreamingAssistant ? deferredEntryBody : entryBody;
    const streamingPreview = isStreamingAssistant
      ? buildStreamingAssistantPreview(assistantBody)
      : null;

    return (
      <article className="mr-auto w-full px-4 py-2">
        {isStreamingAssistant ? (
          <>
            {streamingPreview?.truncated ? (
              <div className="mb-2 rounded-lg bg-surface-soft px-3 py-2 text-xs text-muted">
                Showing the latest part of this streaming reply to keep Sense-1 responsive.
              </div>
            ) : null}
            <div className="text-sm leading-[1.6] whitespace-pre-wrap text-ink">
              {streamingPreview?.visibleText ?? assistantBody}
            </div>
          </>
        ) : (
          <ThreadMarkdown onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>{entryBody}</ThreadMarkdown>
        )}
        {!isStreamingAssistant && entryBody.trim() ? (
          <div className="mt-1 flex items-center justify-start">
            <EntryCopyButton text={entryBody} />
          </div>
        ) : null}
      </article>
    );
  }

  if (entry.kind === "command") {
    const commandPreview = summarizeCommand(entry.command);
    const { detail, emptyOutputHint } = describeCommandExecution(entry);
    return (
      <article className="px-4 py-1 text-xs">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-ink-muted">
            <div className="min-w-0">
              <p className="truncate text-ink">{commandPreview}</p>
              <p className="truncate font-mono text-[0.6875rem] text-ink-faint">{firstLinePreview(entry.command, "Command execution")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[0.6875rem] text-ink-muted">{coerceDisplayText(entry.status, "running")}</span>
              <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="mt-1.5 space-y-1.5 pl-4">
            {detail ? <p className="text-[0.6875rem] text-ink-faint">{detail}</p> : null}
            <p className="rounded bg-surface-soft px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink">{coerceDisplayText(entry.command, "Command execution")}</p>
            {entryBody.trim() ? (
              <pre className="max-h-56 overflow-auto rounded-lg bg-surface-soft px-3 py-2 text-xs whitespace-pre-wrap text-ink">{entryBody}</pre>
            ) : (
              <p className="text-xs text-muted">{emptyOutputHint}</p>
            )}
          </div>
        </details>
      </article>
    );
  }

  if (entry.kind === "tool") {
    const toolPreview = firstLinePreview(entryBody, "Sense-1 used a connected tool.");
    return (
      <article className="px-4 py-2 text-sm">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 text-sm text-muted">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
              <p className="mt-1 truncate text-xs text-ink-faint">{toolPreview}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {"status" in entry && entry.status ? <span className="text-xs text-muted">{coerceDisplayText(entry.status)}</span> : null}
              <ChevronRight className="size-3.5 text-muted transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <ThreadMarkdown className="mt-2 pl-6 text-ink-soft" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
            {entryBody}
          </ThreadMarkdown>
        </details>
      </article>
    );
  }

  if (entry.kind === "fileChange") {
    return (
      <article className="px-4 py-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
          <span className="text-xs text-muted">{entry.status}</span>
        </div>
        <div className="mt-2 space-y-1 pl-6">
          {entry.changes.length > 0 ? (
            entry.changes.map((change, index) => {
              const filePath = typeof change.path === "string" ? change.path.trim() : "";
              if (!filePath) {
                return (
                  <div className="rounded-lg bg-surface-soft px-3 py-2 text-xs text-ink" key={`${entry.id}-${index.toString()}`}>
                    <p className="font-medium">{coerceDisplayText(change.path, "Unknown path")}</p>
                    <p className="text-muted">{coerceDisplayText(change.kind, "changed")}</p>
                  </div>
                );
              }

              const name = fileBasename(filePath);
              const IconComponent = getFileIcon(name);
              const relativePath = fileRelativePath(filePath, workspaceRoot);

              return (
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg bg-surface-soft px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-surface-strong"
                  key={`${entry.id}-${index.toString()}`}
                  onClick={() => openThreadFile(filePath, workspaceRoot)}
                  type="button"
                >
                  <IconComponent className="size-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    <p className="truncate text-muted">
                      {getFileLabel(name)}
                      {relativePath !== name ? ` · ${relativePath}` : ""}
                    </p>
                  </span>
                  <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.06em] text-muted">
                    {coerceDisplayText(change.kind, "changed")}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="text-xs text-muted">No file paths were recorded for this change.</p>
          )}
        </div>
      </article>
    );
  }

  if (entry.kind === "plan") {
    return (
      <article className="px-4 py-2 text-sm">
        <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
        <ThreadMarkdown className="mt-2" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
          {entryBody}
        </ThreadMarkdown>
        {entry.steps.length > 0 ? (
          <ul className="mt-2 space-y-1 pl-6 text-xs text-muted">
            {entry.steps.map((step, index) => (
              <li className="rounded-lg bg-surface-soft px-3 py-2" key={`${entry.id}-step-${index.toString()}`}>
                {step}
              </li>
            ))}
          </ul>
        ) : null}
      </article>
    );
  }

  if (entry.kind === "reasoning") {
    return (
      <article className="rounded-none border-l-2 border-line bg-surface-soft px-4 py-3 text-sm">
        <details className="thread-reasoning-toggle">
          <summary className="flex cursor-pointer items-center gap-2">
            <ChevronRight className="size-3.5 text-muted transition-transform [[open]>&]:rotate-90" />
            <span className="text-xs uppercase tracking-[0.11em] text-ink-faint">{entry.title}</span>
            <span className="ml-auto text-xs text-ink-faint">{coerceDisplayText(entry.summary, "Reasoning updated")}</span>
          </summary>
          <ThreadMarkdown className="mt-2 text-sm text-ink-faint" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
            {entryBody}
          </ThreadMarkdown>
        </details>
      </article>
    );
  }

  return (
    <article className="px-4 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
        {"status" in entry && entry.status ? <span className="text-xs text-muted">{coerceDisplayText(entry.status)}</span> : null}
      </div>
      <ThreadMarkdown className="mt-2" onOpenInternalBrowser={onOpenInternalBrowser} workspaceRoot={workspaceRoot}>
        {entryBody}
      </ThreadMarkdown>
    </article>
  );
}, areThreadEntryCardPropsEqual);

function ThreadEntryListInner({
  entries,
  extensionOverview,
  suppressFileChanges = false,
  threadId,
  threadBusy = false,
  onOpenInternalBrowser,
  workspaceRoot,
}: ThreadEntryListProps) {
  const previousEntriesRef = useRef<DesktopThreadEntry[] | null>(null);
  const previousGroupedEntriesRef = useRef<ThreadGroupedEntry[] | null>(null);

  const groupedEntries =
    reuseGroupedThreadEntries(previousEntriesRef.current, entries, previousGroupedEntriesRef.current)
    ?? groupThreadEntries(entries);
  let lastActivityGroupIndex = -1;
  if (threadBusy) {
    for (let index = groupedEntries.length - 1; index >= 0; index -= 1) {
      if (groupedEntries[index].kind === "activity-group") {
        lastActivityGroupIndex = index;
        break;
      }
    }
  }

  previousEntriesRef.current = entries;
  previousGroupedEntriesRef.current = groupedEntries;

  return (
    <>
      {groupedEntries.map((grouped, index) =>
        grouped.kind === "passthrough" ? (
          grouped.entry.kind === "fileChange" && suppressFileChanges
            ? null
            : <ThreadEntryCard entry={grouped.entry} extensionOverview={extensionOverview} key={grouped.entry.id} onOpenInternalBrowser={onOpenInternalBrowser} threadId={threadId} workspaceRoot={workspaceRoot} />
        ) : (
          <ActivityGroupCard
            extensionOverview={extensionOverview}
            forceOpen={threadBusy && index === lastActivityGroupIndex}
            group={grouped}
            key={grouped.id}
            onOpenInternalBrowser={onOpenInternalBrowser}
            suppressFileChanges={suppressFileChanges}
            threadId={threadId}
            workspaceRoot={workspaceRoot}
          />
        ),
      )}
    </>
  );
}

export const ThreadEntryList = memo(ThreadEntryListInner);
