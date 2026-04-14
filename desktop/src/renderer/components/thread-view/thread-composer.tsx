import { memo, useDeferredValue, useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { BrainCircuit, Mic, Paperclip, Send, Square } from "lucide-react";

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
    const didSubmit = await submitSelectedThreadPrompt(submittedPrompt);
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
    const didQueue = await queueSelectedThreadPrompt(queuedPrompt);
    if (!didQueue) {
      return;
    }
    setThreadPrompt("");
    setShortcutCursorIndex(0);
    setShortcutSelectionIndex(0);
  }

  return (
    <div className="shrink-0" style={{ height: spacerHeight + 24 }}>
      <div ref={floatingRef} className="fixed bottom-3 left-1/2 z-50 flex w-full max-w-3xl -translate-x-1/2 flex-col gap-3 rounded-[1.7rem] bg-white p-3 shadow-[0_-12px_28px_rgba(10,15,20,0.04)]">
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
          <p className="px-1 text-[0.5rem] leading-tight text-black">{dictation.error}</p>
        ) : null}
        {dictation.hint ? (
          <p className="px-1 text-[0.5rem] leading-tight text-black" role="note">{dictation.hint}</p>
        ) : null}
        {dictation.statusText || dictation.liveTranscript?.assistant ? (
          <div className="px-1 text-[0.5rem] leading-tight text-black" role="status">
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
        <div className="flex flex-wrap items-center gap-2">
          {selectedServiceTier === "fast" ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-full bg-[oklch(18%_0.03_55)] px-3 py-1 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(10,15,20,0.12)]"
              onClick={() => handleServiceTierSelection("flex")}
              type="button"
            >
              Fast mode
            </button>
          ) : null}
          <ShortcutPillRow overview={extensionOverview} prompt={deferredThreadPrompt} />
        </div>
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
            <button
              className={`inline-flex items-center gap-2 rounded-xl border px-2 py-1 text-xs ${selectedServiceTier === "fast" ? "border-[oklch(76%_0.17_75)] bg-[oklch(95%_0.04_85)] text-ink" : "border-line/40 text-muted"}`}
              disabled={composerDisabled}
              onClick={() => handleServiceTierSelection(selectedServiceTier === "fast" ? "flex" : "fast")}
              type="button"
            >
              Fast
            </button>
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
