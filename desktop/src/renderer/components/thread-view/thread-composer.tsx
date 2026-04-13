import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { BrainCircuit, Mic, MicOff, Paperclip, Send, Square } from "lucide-react";

import { Button } from "../ui/button";
import { ShortcutPillRow } from "../composer/shortcut-pill-row.js";
import { ShortcutSuggestionMenu } from "../composer/shortcut-suggestion-menu.js";
import { buildThreadComposerIdentity } from "../../state/session/tenant-identity.js";
import { useComposerDictation } from "../../features/session/use-composer-dictation.js";
import { type DesktopBootstrapTeamSetup, type DesktopBootstrapTenant, type DesktopExtensionOverviewResult, type DesktopModelEntry } from "../../../main/contracts";
import { replaceActivePromptShortcut, resolvePromptShortcutSuggestions } from "../../../shared/prompt-shortcuts.ts";

type ThreadComposerProps = {
  tenant: DesktopBootstrapTenant | null;
  teamSetup: DesktopBootstrapTeamSetup;
  extensionOverview: Pick<DesktopExtensionOverviewResult, "apps" | "plugins" | "skills"> | null;
  taskError: string | null;
  selectedThreadId: string;
  threadPromptOverride: string;
  attachedFiles: string[];
  setAttachedFiles: Dispatch<SetStateAction<string[]>>;
  pickFiles: () => Promise<string[]>;
  modelOptions: string[];
  availableModels: DesktopModelEntry[];
  selectedModel: string;
  handleModelSelection: (nextModel: string) => void;
  queueSelectedThreadPrompt: (threadPrompt: string) => Promise<void>;
  queuedMessageCount: number;
  reasoningOptions: string[];
  REASONING_LABELS: Record<string, string>;
  selectedReasoning: string;
  setReasoning: Dispatch<SetStateAction<string>>;
  effectiveThreadBusy: boolean;
  interruptTurn: () => Promise<void>;
  submitSelectedThreadPrompt: (threadPrompt: string) => Promise<void>;
};

function ThreadComposerInner({
  tenant,
  teamSetup,
  extensionOverview,
  taskError,
  selectedThreadId,
  threadPromptOverride,
  attachedFiles,
  setAttachedFiles,
  pickFiles,
  modelOptions,
  availableModels,
  selectedModel,
  handleModelSelection,
  queueSelectedThreadPrompt,
  queuedMessageCount,
  reasoningOptions,
  REASONING_LABELS,
  selectedReasoning,
  setReasoning,
  effectiveThreadBusy,
  interruptTurn,
  submitSelectedThreadPrompt,
}: ThreadComposerProps) {
  const teamIdentity = buildThreadComposerIdentity(tenant, teamSetup);
  const [threadPrompt, setThreadPrompt] = useState(threadPromptOverride);
  const composerDisabled = !teamIdentity.canContinueThread;
  const sendDisabled = composerDisabled || !threadPrompt.trim();
  const dictation = useComposerDictation({
    enabled: !composerDisabled,
    value: threadPrompt,
    setValue: setThreadPrompt,
  });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [shortcutCursorIndex, setShortcutCursorIndex] = useState(threadPrompt.length);
  const [shortcutSelectionIndex, setShortcutSelectionIndex] = useState(0);
  const deferredThreadPrompt = useDeferredValue(threadPrompt);
  const shortcutSuggestions = useMemo(
    () => (extensionOverview ? resolvePromptShortcutSuggestions(deferredThreadPrompt, extensionOverview, shortcutCursorIndex) : []),
    [deferredThreadPrompt, extensionOverview, shortcutCursorIndex],
  );
  const visibleShortcutSuggestions = shortcutSuggestions.slice(0, 8);

  useEffect(() => {
    setThreadPrompt(threadPromptOverride);
    setShortcutCursorIndex(threadPromptOverride.length);
  }, [selectedThreadId, threadPromptOverride]);

  useEffect(() => {
    setShortcutSelectionIndex(0);
  }, [deferredThreadPrompt, shortcutCursorIndex, shortcutSuggestions.length]);

  function applyShortcutSuggestion(token: string) {
    const selectionIndex =
      composerRef.current && document.activeElement === composerRef.current
        ? composerRef.current.selectionStart ?? shortcutCursorIndex
        : shortcutCursorIndex;
    let nextSelection = replaceActivePromptShortcut(
      threadPrompt,
      token,
      selectionIndex,
    );
    if (nextSelection.prompt === threadPrompt && selectionIndex !== threadPrompt.length) {
      nextSelection = replaceActivePromptShortcut(
        threadPrompt,
        token,
        threadPrompt.length,
      );
    }
    setThreadPrompt(nextSelection.prompt);
    setShortcutCursorIndex(nextSelection.cursorIndex);
    setShortcutSelectionIndex(0);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextSelection.cursorIndex, nextSelection.cursorIndex);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        applyShortcutSuggestion(visibleShortcutSuggestions[shortcutSelectionIndex]?.token ?? visibleShortcutSuggestions[0]?.token ?? "");
        return;
      }
      if (event.key === "Escape") {
        setShortcutSelectionIndex(0);
      }
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void submitSelectedThreadPrompt(threadPrompt);
  }

  return (
    <div className="sticky bottom-0 z-10 bg-white/94 px-6 py-3 backdrop-blur-sm">
      <div className="flex w-full flex-col gap-3 rounded-[1.7rem] bg-white p-3 shadow-[0_-12px_28px_rgba(10,15,20,0.04)]">
        {taskError ? (
          <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft" role="alert">
            {taskError}
          </p>
        ) : null}
        {!teamIdentity.canContinueThread && teamIdentity.message ? (
          <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft" role="status">
            {teamIdentity.message}
          </p>
        ) : null}
        {teamIdentity.canContinueThread && !tenant && teamIdentity.message ? (
          <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft" role="status">
            {teamIdentity.message}
          </p>
        ) : null}
        {dictation.error ? (
          <p className="rounded-xl bg-surface-soft px-3 py-2 text-sm text-ink-soft">{dictation.error}</p>
        ) : null}
        {visibleShortcutSuggestions.length > 0 ? (
          <ShortcutSuggestionMenu
            activeIndex={shortcutSelectionIndex}
            onSelect={(suggestion) => applyShortcutSuggestion(suggestion.token)}
            suggestions={visibleShortcutSuggestions}
          />
        ) : null}
        <ShortcutPillRow overview={extensionOverview} prompt={deferredThreadPrompt} />
        <textarea
          className="min-h-[5.5rem] resize-none rounded-xl border border-line/40 bg-canvas px-3 py-2 text-sm outline-none transition-all placeholder:text-muted focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={composerDisabled}
          onClick={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onKeyDown={handleComposerKeyDown}
          onKeyUp={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onChange={(event) => {
            setThreadPrompt(event.target.value);
            setShortcutCursorIndex(event.target.selectionStart ?? event.target.value.length);
          }}
          placeholder={composerDisabled ? "Sign in with ChatGPT before continuing this thread." : "Continue this thread..."}
          ref={composerRef}
          value={threadPrompt}
        />
        {attachedFiles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((filePath) => (
              <span className="inline-flex items-center gap-1 rounded-lg bg-surface-soft px-2 py-1 text-xs text-ink-soft" key={filePath}>
                <Paperclip className="size-3" />
                {filePath.split(/[\\/]/).at(-1)}
                <button
                  aria-label={`Remove ${filePath}`}
                  className="ml-0.5 text-muted hover:text-ink"
                  disabled={composerDisabled}
                  onClick={() => setAttachedFiles((current) => current.filter((p) => p !== filePath))}
                  type="button"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              disabled={composerDisabled || effectiveThreadBusy}
              onClick={async () => {
                const paths = await pickFiles();
                if (paths.length > 0) {
                  setAttachedFiles((current) => [...new Set([...current, ...paths])]);
                }
              }}
              size="sm"
              variant="secondary"
            >
              <Paperclip />
              Add local files
            </Button>
            <Button
              disabled={composerDisabled || !dictation.supported}
              onClick={() => dictation.toggle()}
              size="sm"
              variant="secondary"
            >
              {dictation.active ? <MicOff /> : <Mic />}
              {dictation.active ? "Stop dictation" : "Dictate"}
            </Button>
            <label className="inline-flex items-center gap-2 rounded-xl border border-line/40 px-2 py-1 text-xs text-muted">
              <select
                className="bg-transparent text-ink outline-none"
                disabled={composerDisabled || modelOptions.length === 0}
                onChange={(event) => handleModelSelection(event.target.value)}
                value={selectedModel || ""}
              >
                {modelOptions.length > 0 ? (
                  modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {availableModels.find((model) => model.id === option)?.name ?? option}
                    </option>
                  ))
                ) : (
                  <option value="">Loading live models...</option>
                )}
              </select>
            </label>
            <label className="inline-flex items-center gap-2 rounded-xl border border-line/40 px-2 py-1 text-xs text-muted">
              <BrainCircuit className="size-3.5" />
              <select
                className="bg-transparent text-ink outline-none"
                disabled={composerDisabled || reasoningOptions.length === 0}
                onChange={(event) => setReasoning(event.target.value)}
                value={selectedReasoning || ""}
              >
                {reasoningOptions.length > 0 ? (
                  reasoningOptions.map((option) => (
                    <option key={option} value={option}>
                      {REASONING_LABELS[option] ?? option}
                    </option>
                  ))
                ) : (
                  <option value="">Runtime default</option>
                )}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            {queuedMessageCount > 0 ? (
              <span className="text-xs text-ink-muted">{queuedMessageCount} queued</span>
            ) : null}
            {effectiveThreadBusy ? (
              <>
                <Button disabled={sendDisabled} onClick={() => void queueSelectedThreadPrompt(threadPrompt)} size="sm" variant="secondary">
                  Queue
                </Button>
                <Button aria-label="Send now to active run" disabled={sendDisabled} onClick={() => void submitSelectedThreadPrompt(threadPrompt)} size="sm" variant="default">
                  <Send />
                  Send now
                </Button>
                <Button aria-label="Stop run" onClick={() => void interruptTurn()} size="icon" variant="destructive">
                  <Square />
                </Button>
              </>
            ) : (
              <Button aria-label="Send message" disabled={sendDisabled} onClick={() => void submitSelectedThreadPrompt(threadPrompt)} size="icon" variant="default">
                <Send />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ThreadComposer = memo(ThreadComposerInner);
