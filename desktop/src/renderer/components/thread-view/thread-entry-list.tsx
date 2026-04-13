import { memo, useMemo, useState } from "react";
import { Check, ChevronRight, Copy } from "lucide-react";

import { ThreadMarkdown } from "../../thread-markdown.js";
import {
  coerceDisplayText,
  firstLinePreview,
  groupThreadEntries,
  resolveFileChangeTarget,
  type ThreadGroupedEntry,
} from "./thread-view-utils.js";
import { type DesktopThreadEntry } from "../../lib/live-thread-data.js";
import { getFileIcon, getFileLabel } from "../../lib/file-icons";
import { resolveWorkspaceFilePath } from "../right-rail/RightRailSection";

type ThreadEntryListProps = {
  entries: DesktopThreadEntry[];
  suppressFileChanges?: boolean;
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

function ActivityGroupCard({
  group,
  suppressFileChanges = false,
  workspaceRoot,
}: {
  group: Extract<ThreadGroupedEntry, { kind: "activity-group" }>;
  suppressFileChanges?: boolean;
  workspaceRoot: string | null;
}) {
  const allCompleted = group.entries.every((entry) => "status" in entry && entry.status === "completed");
  const runningCount = group.entries.filter((entry) => "status" in entry && entry.status !== "completed").length;
  const visibleEntries = suppressFileChanges
    ? group.entries.filter((entry) => entry.kind !== "fileChange")
    : group.entries;

  if (visibleEntries.length === 0) {
    return null;
  }

  return (
    <article className="px-4 py-1.5" key={group.id}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 items-center gap-1.5">
            {allCompleted ? (
              <Check className="size-3 shrink-0 text-accent" />
            ) : (
              <span className="relative flex size-3 shrink-0 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-20" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
            )}
            <p className="truncate text-ink-muted">{group.latestLabel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[0.6875rem] text-ink-muted">{allCompleted ? "done" : `${runningCount} running`}</span>
            <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
          </div>
        </summary>
        <div className="mt-1.5 space-y-0.5 pl-5">
          {visibleEntries.map((entry) => renderThreadEntry(entry, workspaceRoot))}
        </div>
      </details>
    </article>
  );
}

function renderThreadEntry(entry: DesktopThreadEntry, workspaceRoot: string | null = null) {
  const entryBody = "body" in entry ? coerceDisplayText(entry.body) : "";

  if (entry.kind === "user") {
    return (
      <article className="ml-auto w-full max-w-[78%] rounded-xl bg-[color-mix(in_oklch,var(--color-ink)_5%,white)] px-3 py-2 text-[0.8125rem]" key={entry.id}>
        <ThreadMarkdown className="thread-markdown-user" workspaceRoot={workspaceRoot}>
          {entryBody}
        </ThreadMarkdown>
      </article>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <article className="mr-auto w-full px-4 py-2" key={entry.id}>
        {"status" in entry && entry.status === "streaming" ? (
          <div className="text-sm leading-[1.6] whitespace-pre-wrap text-ink">{entryBody}</div>
        ) : (
          <ThreadMarkdown workspaceRoot={workspaceRoot}>{entryBody}</ThreadMarkdown>
        )}
        {entryBody.trim() ? (
          <div className="mt-1 flex items-center justify-start">
            <EntryCopyButton text={entryBody} />
          </div>
        ) : null}
      </article>
    );
  }

  if (entry.kind === "command") {
    const commandPreview = firstLinePreview(entry.command, "Command execution");
    return (
      <article className="px-4 py-1 text-xs" key={entry.id}>
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs text-ink-muted">
            <p className="min-w-0 truncate font-mono">{commandPreview}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-[0.6875rem] text-ink-muted">{coerceDisplayText(entry.status, "running")}</span>
              <ChevronRight className="size-3 text-ink-muted transition-transform group-open:rotate-90" />
            </div>
          </summary>
          <div className="mt-1.5 space-y-1.5 pl-4">
            <p className="rounded bg-surface-soft px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink">{coerceDisplayText(entry.command, "Command execution")}</p>
            {entryBody.trim() ? (
              <pre className="max-h-56 overflow-auto rounded-lg bg-surface-soft px-3 py-2 text-xs whitespace-pre-wrap text-ink">{entryBody}</pre>
            ) : (
              <p className="text-xs text-muted">No command output captured yet.</p>
            )}
          </div>
        </details>
      </article>
    );
  }

  if (entry.kind === "tool") {
    const toolPreview = firstLinePreview(entryBody, "Sense-1 used a connected tool.");
    return (
      <article className="px-4 py-2 text-sm" key={entry.id}>
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
          <ThreadMarkdown className="mt-2 pl-6 text-ink-soft" workspaceRoot={workspaceRoot}>
            {entryBody}
          </ThreadMarkdown>
        </details>
      </article>
    );
  }

  if (entry.kind === "fileChange") {
    return (
      <article className="px-4 py-2 text-sm" key={entry.id}>
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
      <article className="px-4 py-2 text-sm" key={entry.id}>
        <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
        <ThreadMarkdown className="mt-2" workspaceRoot={workspaceRoot}>
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
      <article className="rounded-none border-l-2 border-line bg-surface-soft px-4 py-3 text-sm" key={entry.id}>
        <details className="thread-reasoning-toggle">
          <summary className="flex cursor-pointer items-center gap-2">
            <ChevronRight className="size-3.5 text-muted transition-transform [[open]>&]:rotate-90" />
            <span className="text-xs uppercase tracking-[0.11em] text-ink-faint">{entry.title}</span>
            <span className="ml-auto text-xs text-ink-faint">{coerceDisplayText(entry.summary, "Reasoning updated")}</span>
          </summary>
          <ThreadMarkdown className="mt-2 text-sm text-ink-faint" workspaceRoot={workspaceRoot}>
            {entryBody}
          </ThreadMarkdown>
        </details>
      </article>
    );
  }

  return (
    <article className="px-4 py-2 text-sm" key={entry.id}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.11em] text-muted">{entry.title}</p>
        {"status" in entry && entry.status ? <span className="text-xs text-muted">{coerceDisplayText(entry.status)}</span> : null}
      </div>
      <ThreadMarkdown className="mt-2" workspaceRoot={workspaceRoot}>
        {entryBody}
      </ThreadMarkdown>
    </article>
  );
}

function ThreadEntryListInner({ entries, suppressFileChanges = false, workspaceRoot }: ThreadEntryListProps) {
  const groupedEntries = useMemo(() => groupThreadEntries(entries), [entries]);

  return (
    <>
      {groupedEntries.map((grouped) =>
        grouped.kind === "passthrough" ? (
          grouped.entry.kind === "fileChange" && suppressFileChanges ? null : renderThreadEntry(grouped.entry, workspaceRoot)
        ) : (
          <ActivityGroupCard key={grouped.id} group={grouped} suppressFileChanges={suppressFileChanges} workspaceRoot={workspaceRoot} />
        ),
      )}
    </>
  );
}

export const ThreadEntryList = memo(ThreadEntryListInner);
