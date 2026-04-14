import { useEffect, useState, type RefObject } from "react";
import type { DesktopThreadSnapshot } from "../../../main/contracts";
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
    setAttachedFiles([]);
    setTaskError(null);
  }

  async function submitSelectedThreadPrompt(threadPrompt: string) {
    if (await handleFastModeCommand(threadPrompt)) {
      setThreadPromptOverride("");
      setAttachedFiles([]);
      setTaskError(null);
      return true;
    }

    const request = buildSelectedThreadRunRequest({
      attachedFiles,
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
    setThreadPromptOverride("");
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
      setAttachedFiles([]);
      setTaskError(null);
      return true;
    }

    const request = buildSelectedThreadRunRequest({
      attachedFiles,
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
    setThreadPromptOverride("");
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
      setAttachedFiles([]);
      setTaskError(null);
      return;
    }

    const request = buildDraftRunRequest({
      attachedFiles,
      draftPrompt,
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
    setAttachedFiles([]);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    await runTask(request);
  }

  return {
    draftPrompt,
    setDraftPrompt,
    threadPromptOverride,
    setThreadPrompt: setThreadPromptOverride,
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
