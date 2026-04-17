import { useEffect, useState, type RefObject } from "react";
import type { DesktopAppServerInputItem, DesktopThreadSnapshot } from "../../../main/contracts";
import {
  buildDraftRunRequest,
  buildSelectedThreadRunRequest,
  shouldUseSelectedThreadBusyActions,
} from "./app-composer-utils.js";

type UseAppComposerParams = {
  canSteerSelectedThread: boolean;
  currentRequestId: number | string | null;
  clearSelectedThread: () => Promise<void>;
  effectiveThreadBusy: boolean;
  handleFastModeCommand: (prompt: string) => Promise<boolean>;
  queueTurnInput: (input: string) => Promise<void>;
  runTask: (request: {
    prompt: string;
    threadId?: string;
    cwd?: string | null;
    workspaceRoot?: string | null;
    attachments?: string[];
    inputItems?: DesktopAppServerInputItem[];
  }) => Promise<unknown>;
  selectedThread: DesktopThreadSnapshot | null;
  selectedThreadId: string | null;
  setFolderMenuOpen: (value: boolean) => void;
  setTaskError: (value: string | null) => void;
  steerTurn: (input: string) => Promise<void>;
  transcriptEndRef: RefObject<HTMLDivElement | null>;
  workInFolder: boolean;
  workspaceFolder: string | null;
};

export function useAppComposer({
  canSteerSelectedThread,
  currentRequestId,
  clearSelectedThread,
  effectiveThreadBusy,
  handleFastModeCommand,
  queueTurnInput,
  runTask,
  selectedThread,
  selectedThreadId,
  setFolderMenuOpen,
  setTaskError,
  steerTurn,
  transcriptEndRef,
  workInFolder,
  workspaceFolder,
}: UseAppComposerParams) {
  const [draftPrompt, setDraftPrompt] = useState("");
  const [threadPromptOverride, setThreadPromptOverride] = useState("");
  const [draftPromptInputItems, setDraftPromptInputItems] = useState<DesktopAppServerInputItem[]>([]);
  const [threadPromptInputItems, setThreadPromptInputItems] = useState<DesktopAppServerInputItem[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [inputResponseText, setInputResponseText] = useState("");
  const [inputResponsePending, setInputResponsePending] = useState(false);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [clarificationPending, setClarificationPending] = useState(false);
  const [selectedChipIndex, setSelectedChipIndex] = useState<number | null>(null);

  useEffect(() => {
    setClarificationAnswer("");
    setClarificationPending(false);
    setSelectedChipIndex(null);
  }, [selectedThreadId, currentRequestId]);

  function resetComposerState() {
    void clearSelectedThread();
    setDraftPrompt("");
    setThreadPromptOverride("");
    setDraftPromptInputItems([]);
    setThreadPromptInputItems([]);
    setAttachedFiles([]);
    setTaskError(null);
  }

  function setDraftPromptSeed(prompt: string, inputItems: DesktopAppServerInputItem[] = []) {
    setDraftPrompt(prompt);
    setDraftPromptInputItems([...inputItems]);
  }

  function setThreadPromptSeed(prompt: string, inputItems: DesktopAppServerInputItem[] = []) {
    setThreadPromptOverride(prompt);
    setThreadPromptInputItems([...inputItems]);
  }

  async function submitSelectedThreadPrompt(threadPrompt: string) {
    if (await handleFastModeCommand(threadPrompt)) {
      setThreadPromptOverride("");
      setThreadPromptInputItems([]);
      setAttachedFiles([]);
      setTaskError(null);
      return true;
    }

    const request = buildSelectedThreadRunRequest({
      attachedFiles,
      inputItems: threadPromptInputItems,
      selectedThread,
      threadPrompt,
    });
    if (!request) {
      return false;
    }
    const useBusyThreadActions = shouldUseSelectedThreadBusyActions({
      canSteerSelectedThread,
      effectiveThreadBusy,
    });
    if (useBusyThreadActions && attachedFiles.length > 0) {
      setTaskError("Finish the current run before sending attachments.");
      return false;
    }
    if (useBusyThreadActions && (request.inputItems?.length ?? 0) > 0) {
      setTaskError("Finish the current run before invoking a plugin, app, or skill shortcut.");
      return false;
    }
    setThreadPromptOverride("");
    setThreadPromptInputItems([]);
    setAttachedFiles([]);
    setTaskError(null);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    if (useBusyThreadActions) {
      await steerTurn(request.prompt);
      return true;
    }
    await runTask(request);
    return true;
  }

  async function queueSelectedThreadPrompt(threadPrompt: string) {
    if (await handleFastModeCommand(threadPrompt)) {
      setThreadPromptOverride("");
      setThreadPromptInputItems([]);
      setAttachedFiles([]);
      setTaskError(null);
      return true;
    }

    const request = buildSelectedThreadRunRequest({
      attachedFiles,
      inputItems: threadPromptInputItems,
      selectedThread,
      threadPrompt,
    });
    if (!request) {
      return false;
    }
    const useBusyThreadActions = shouldUseSelectedThreadBusyActions({
      canSteerSelectedThread,
      effectiveThreadBusy,
    });
    if (useBusyThreadActions && attachedFiles.length > 0) {
      setTaskError("Finish the current run before sending attachments.");
      return false;
    }
    if (useBusyThreadActions && (request.inputItems?.length ?? 0) > 0) {
      setTaskError("Finish the current run before invoking a plugin, app, or skill shortcut.");
      return false;
    }
    setThreadPromptOverride("");
    setThreadPromptInputItems([]);
    setAttachedFiles([]);
    setTaskError(null);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    if (useBusyThreadActions) {
      await queueTurnInput(request.prompt);
      return true;
    }
    await runTask(request);
    return true;
  }

  async function submitDraftTask() {
    if (await handleFastModeCommand(draftPrompt)) {
      setDraftPrompt("");
      setDraftPromptInputItems([]);
      setAttachedFiles([]);
      setTaskError(null);
      return;
    }

    const request = buildDraftRunRequest({
      attachedFiles,
      draftPrompt,
      inputItems: draftPromptInputItems,
      workInFolder,
      workspaceFolder,
    });
    if (!request) {
      return;
    }
    if ("needsFolderSelection" in request) {
      setFolderMenuOpen(true);
      return;
    }
    setDraftPrompt("");
    setDraftPromptInputItems([]);
    setAttachedFiles([]);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    await runTask(request);
  }

  return {
    draftPrompt,
    setDraftPrompt,
    setDraftPromptSeed,
    threadPromptOverride,
    setThreadPrompt: setThreadPromptOverride,
    setThreadPromptSeed,
    attachedFiles,
    setAttachedFiles,
    inputResponseText,
    setInputResponseText,
    inputResponsePending,
    setInputResponsePending,
    clarificationAnswer,
    setClarificationAnswer,
    clarificationPending,
    setClarificationPending,
    selectedChipIndex,
    setSelectedChipIndex,
    resetComposerState,
    queueSelectedThreadPrompt,
    submitSelectedThreadPrompt,
    submitDraftTask,
  };
}
