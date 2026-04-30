import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { BrainCircuit, Bug, Mic, Paperclip, Send, Square, Zap } from "lucide-react";

import { Button } from "../ui/button";
import { FastModeSuggestionMenu } from "../composer/fast-mode-suggestion-menu.js";
import { ShortcutPillRow } from "../composer/shortcut-pill-row.js";
import { ShortcutSuggestionMenu } from "../composer/shortcut-suggestion-menu.js";
import { VoiceRecordingPill } from "../composer/voice-recording-pill.js";
import { buildThreadComposerIdentity } from "../../state/session/tenant-identity.js";
import {
  applyFastModeSuggestion,
  resolveFastModeSuggestions,
} from "../../features/session/fast-mode-command.js";
import { useComposerDictation } from "../../features/session/use-composer-dictation.js";
import { type DesktopBootstrapTeamSetup, type DesktopBootstrapTenant, type DesktopExtensionOverviewResult, type DesktopModelEntry } from "../../../main/contracts";
import { replaceActivePromptShortcut, resolvePromptShortcutSuggestions } from "../../../shared/prompt-shortcuts.ts";
import {
  buildBrowserUsePrompt,
  hasBrowserUseMention,
  replaceActiveBrowserUseShortcut,
  resolveActiveBrowserUseShortcutSuggestion,
  type BrowserUseContext,
} from "../../../shared/browser-use-invocation.ts";
import browserUseIconUrl from "../../assets/browser-use.png";

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
  selectedServiceTier: "flex" | "fast";
  handleModelSelection: (nextModel: string) => void;
  handleServiceTierSelection: (nextServiceTier: "flex" | "fast") => void;
  queueSelectedThreadPrompt: (threadPrompt: string) => Promise<boolean>;
  queuedMessageCount: number;
  reasoningOptions: string[];
  REASONING_LABELS: Record<string, string>;
  selectedReasoning: string;
  setReasoning: Dispatch<SetStateAction<string>>;
  effectiveThreadBusy: boolean;
  interruptTurn: () => Promise<void>;
  submitSelectedThreadPrompt: (threadPrompt: string) => Promise<boolean>;
  browserUseContext?: BrowserUseContext | null;
  variant?: "floating" | "rail";
  onReportBug: () => void;
};

function BrowserUseShortcutSuggestionButton({ onSelect }: { onSelect: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-glass p-2 shadow-[var(--shadow-menu)] backdrop-blur-sm">
      <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Browser shortcut
      </p>
      <button
        className="flex w-full items-center gap-2 rounded-xl bg-ink px-2 py-1.5 text-left text-[0.6875rem] text-canvas transition-colors"
        onMouseDown={(event) => {
          event.preventDefault();
          onSelect();
        }}
        onClick={(event) => event.preventDefault()}
        type="button"
      >
        <img alt="" className="size-3.5 shrink-0 rounded-sm" src={browserUseIconUrl} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">Browser Use</span>
          <span className="block truncate text-canvas/70">@browser-use · Operate the in-app browser</span>
        </span>
      </button>
    </div>
  );
}

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
  selectedServiceTier,
  handleModelSelection,
  handleServiceTierSelection,
  queueSelectedThreadPrompt,
  queuedMessageCount,
  reasoningOptions,
  REASONING_LABELS,
  selectedReasoning,
  setReasoning,
  effectiveThreadBusy,
  interruptTurn,
  submitSelectedThreadPrompt,
  browserUseContext = null,
  variant = "floating",
  onReportBug,
}: ThreadComposerProps) {
  const teamIdentity = buildThreadComposerIdentity(tenant, teamSetup);
  const [threadPrompt, setThreadPrompt] = useState(threadPromptOverride);
  const composerDisabled = !teamIdentity.canContinueThread;
  const sendDisabled = composerDisabled || !threadPrompt.trim();
  const dictation = useComposerDictation({
    enabled: !composerDisabled,
    threadId: selectedThreadId,
    value: threadPrompt,
    setValue: setThreadPrompt,
  });
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);
  const [spacerHeight, setSpacerHeight] = useState(192);
  const [shortcutCursorIndex, setShortcutCursorIndex] = useState(threadPrompt.length);
  const [shortcutSelectionIndex, setShortcutSelectionIndex] = useState(0);
  const deferredThreadPrompt = useDeferredValue(threadPrompt);
  const shortcutSuggestions = useMemo(
    () => (extensionOverview ? resolvePromptShortcutSuggestions(deferredThreadPrompt, extensionOverview, shortcutCursorIndex) : []),
    [deferredThreadPrompt, extensionOverview, shortcutCursorIndex],
  );
  const visibleShortcutSuggestions = shortcutSuggestions.slice(0, 8);
  const fastModeSuggestions = useMemo(
    () => resolveFastModeSuggestions(threadPrompt, shortcutCursorIndex),
    [threadPrompt, shortcutCursorIndex],
  );
  const browserUseSuggestion = useMemo(
    () => resolveActiveBrowserUseShortcutSuggestion(threadPrompt, shortcutCursorIndex),
    [threadPrompt, shortcutCursorIndex],
  );

  useEffect(() => {
    setThreadPrompt(threadPromptOverride);
    setShortcutCursorIndex(threadPromptOverride.length);
  }, [selectedThreadId, threadPromptOverride]);

  useEffect(() => {
    setShortcutSelectionIndex(0);
  }, [deferredThreadPrompt, shortcutCursorIndex, shortcutSuggestions.length]);

  useEffect(() => {
    const el = floatingRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSpacerHeight(entry.borderBoxSize[0]?.blockSize ?? el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  function applyFastSuggestion(command: string) {
    const nextSelection = applyFastModeSuggestion(command);
    setThreadPrompt(nextSelection.prompt);
    setShortcutCursorIndex(nextSelection.cursorIndex);
    setShortcutSelectionIndex(0);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextSelection.cursorIndex, nextSelection.cursorIndex);
    });
  }

  function applyBrowserUseSuggestion() {
    const selectionIndex =
      composerRef.current && document.activeElement === composerRef.current
        ? composerRef.current.selectionStart ?? shortcutCursorIndex
        : shortcutCursorIndex;
    let nextSelection = replaceActiveBrowserUseShortcut(threadPrompt, selectionIndex);
    if (nextSelection.prompt === threadPrompt && selectionIndex !== threadPrompt.length) {
      nextSelection = replaceActiveBrowserUseShortcut(threadPrompt, threadPrompt.length);
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
    if (fastModeSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setShortcutSelectionIndex((current) => (current + 1) % fastModeSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setShortcutSelectionIndex((current) => (current - 1 + fastModeSuggestions.length) % fastModeSuggestions.length);
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        applyFastSuggestion(fastModeSuggestions[shortcutSelectionIndex]?.command ?? fastModeSuggestions[0]?.command ?? "");
        return;
      }
      if (event.key === "Escape") {
        setShortcutSelectionIndex(0);
        return;
      }
    }

    if (browserUseSuggestion) {
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        event.preventDefault();
        applyBrowserUseSuggestion();
        return;
      }
      if (event.key === "Escape") {
        setShortcutSelectionIndex(0);
        return;
      }
    }

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
    void handleSubmit();
  }

  async function handleSubmit() {
    const submittedPrompt = threadPrompt.trim();
    if (!submittedPrompt) {
      return;
    }
    const resolvedPrompt = hasBrowserUseMention(submittedPrompt)
      ? buildBrowserUsePrompt(submittedPrompt, browserUseContext ?? { threadId: selectedThreadId, url: null, title: null })
      : submittedPrompt;
    const didSubmit = await submitSelectedThreadPrompt(resolvedPrompt);
    if (!didSubmit) {
      return;
    }
    setThreadPrompt("");
    setShortcutCursorIndex(0);
    setShortcutSelectionIndex(0);
  }

  async function handleQueue() {
    const queuedPrompt = threadPrompt.trim();
    if (!queuedPrompt) {
      return;
    }
    const resolvedPrompt = hasBrowserUseMention(queuedPrompt)
      ? buildBrowserUsePrompt(queuedPrompt, browserUseContext ?? { threadId: selectedThreadId, url: null, title: null })
      : queuedPrompt;
    const didQueue = await queueSelectedThreadPrompt(resolvedPrompt);
    if (!didQueue) {
      return;
    }
    setThreadPrompt("");
    setShortcutCursorIndex(0);
    setShortcutSelectionIndex(0);
  }

  return (
    <div className="shrink-0" style={variant === "rail" ? undefined : { height: spacerHeight + 24 }}>
      <div
        ref={floatingRef}
        className={variant === "rail"
          ? "flex max-h-[45vh] flex-col gap-3 overflow-y-auto border-t border-line bg-surface-high p-3"
          : "fixed bottom-3 left-1/2 z-50 flex w-full max-w-3xl -translate-x-1/2 flex-col gap-3 rounded-[1.7rem] border border-line bg-surface-high p-3 shadow-[var(--shadow-composer)]"}
      >
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
        {dictation.error ? (
          <p className="px-1 text-[0.5rem] leading-tight text-ink">{dictation.error}</p>
        ) : null}
        {dictation.hint ? (
          <p className="px-1 text-[0.5rem] leading-tight text-ink" role="note">{dictation.hint}</p>
        ) : null}
        {dictation.statusText || dictation.liveTranscript?.assistant ? (
          <div className="px-1 text-[0.5rem] leading-tight text-ink" role="status">
            {dictation.statusText ? <p>{dictation.statusText}</p> : null}
            {dictation.liveTranscript?.assistant ? <p>Codex: {dictation.liveTranscript.assistant}</p> : null}
          </div>
        ) : null}
        {fastModeSuggestions.length > 0 ? (
          <FastModeSuggestionMenu
            activeIndex={shortcutSelectionIndex}
            onSelect={(suggestion) => applyFastSuggestion(suggestion.command)}
            suggestions={fastModeSuggestions}
          />
        ) : null}
        {fastModeSuggestions.length === 0 && visibleShortcutSuggestions.length > 0 ? (
          <ShortcutSuggestionMenu
            activeIndex={shortcutSelectionIndex}
            onSelect={(suggestion) => applyShortcutSuggestion(suggestion.token)}
            suggestions={visibleShortcutSuggestions}
          />
        ) : null}
        {fastModeSuggestions.length === 0 && visibleShortcutSuggestions.length === 0 && browserUseSuggestion ? (
          <BrowserUseShortcutSuggestionButton
            onSelect={applyBrowserUseSuggestion}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {hasBrowserUseMention(deferredThreadPrompt) ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F766E] px-3 py-1 text-xs font-semibold text-white shadow-[var(--shadow-raised)]">
              <img alt="" className="size-3.5 rounded-sm" src={browserUseIconUrl} />
              <span className="font-bold">Browser Use</span>
            </span>
          ) : null}
          <ShortcutPillRow overview={extensionOverview} prompt={deferredThreadPrompt} />
        </div>
        <textarea
          className="min-h-[5.5rem] resize-none rounded-xl border border-line bg-canvas px-3 py-2 text-sm outline-none transition-all placeholder:text-muted focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={composerDisabled}
          onClick={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onKeyDown={handleComposerKeyDown}
          onKeyUp={(event) => setShortcutCursorIndex(event.currentTarget.selectionStart ?? event.currentTarget.value.length)}
          onChange={(event) => {
            setThreadPrompt(event.target.value);
            setShortcutCursorIndex(event.target.selectionStart ?? event.target.value.length);
          }}
          placeholder={composerDisabled ? "Sign in before continuing this thread." : "Continue this thread..."}
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
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              aria-label="Add local files"
              disabled={composerDisabled || effectiveThreadBusy}
              onClick={async () => {
                const paths = await pickFiles();
                if (paths.length > 0) {
                  setAttachedFiles((current) => [...new Set([...current, ...paths])]);
                }
              }}
              size="icon"
              variant="secondary"
            >
              <Paperclip />
            </Button>
            <label className="inline-flex items-center gap-2 rounded-xl border border-line px-2 py-1 text-xs text-muted">
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
            <label className="inline-flex items-center gap-2 rounded-xl border border-line px-2 py-1 text-xs text-muted">
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
            <button
              className={`inline-flex items-center gap-2 rounded-xl border px-2 py-1 text-xs ${selectedServiceTier === "fast" ? "border-warning bg-warning-faint text-ink" : "border-line text-muted"}`}
              disabled={composerDisabled}
              onClick={() => handleServiceTierSelection(selectedServiceTier === "fast" ? "flex" : "fast")}
              type="button"
            >
              <Zap className="size-3" />
              Fast
            </button>
            <Button
              aria-label="Use Browser Use"
              disabled={composerDisabled}
              onClick={() => {
                setThreadPrompt((current) => hasBrowserUseMention(current) ? current : `${current.trimEnd()}${current.trim() ? " " : ""}@browser-use `);
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
              size="icon"
              type="button"
              variant="secondary"
            >
              <img alt="" className="size-4 rounded-sm" src={browserUseIconUrl} />
            </Button>
            <Button
              aria-label="Report a bug"
              className="ml-1"
              onClick={onReportBug}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Bug />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {dictation.recordingIndicator ? (
              <VoiceRecordingPill
                elapsedLabel={dictation.recordingIndicator.elapsedLabel}
                levels={dictation.recordingIndicator.levels}
                onStop={() => dictation.stop()}
              />
            ) : !effectiveThreadBusy && dictation.supported ? (
              <Button
                aria-label="Start voice input"
                disabled={composerDisabled}
                onClick={() => dictation.toggle()}
                size="icon"
                variant="secondary"
              >
                <Mic />
              </Button>
            ) : null}
            {queuedMessageCount > 0 ? (
              <span className="text-xs text-ink-muted">{queuedMessageCount} queued</span>
            ) : null}
            {effectiveThreadBusy ? (
              <>
                <Button disabled={sendDisabled} onClick={() => void handleQueue()} size="sm" variant="secondary">
                  Queue
                </Button>
                <Button aria-label="Send now to active run" disabled={sendDisabled} onClick={() => void handleSubmit()} size="sm" variant="default">
                  <Send />
                  Send now
                </Button>
                <Button aria-label="Stop run" onClick={() => void interruptTurn()} size="icon" variant="destructive">
                  <Square />
                </Button>
              </>
            ) : (
              <Button aria-label="Send message" disabled={sendDisabled} onClick={() => void handleSubmit()} size="icon" variant="default">
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
