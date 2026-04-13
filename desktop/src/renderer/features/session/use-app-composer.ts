import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import type { DesktopThreadSnapshot } from "../../../main/contracts";
import {
  buildDraftRunRequest,
  buildSelectedThreadRunRequest,
} from "./app-composer-utils.js";

type UseAppComposerParams = {
  currentRequestId: number | string | null;
  clearSelectedThread: () => Promise<void>;
  effectiveThreadBusy: boolean;
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
  currentRequestId,
  clearSelectedThread,
  effectiveThreadBusy,
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
  const [threadPrompt, setThreadPrompt] = useState("");
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
    setThreadPrompt("");
    setAttachedFiles([]);
    setTaskError(null);
  }

  async function submitSelectedThreadPrompt() {
    const request = buildSelectedThreadRunRequest({
      attachedFiles,
      selectedThread,
      threadPrompt,
    });
    if (!request) {
      return;
    }
    if (effectiveThreadBusy && attachedFiles.length > 0) {
      setTaskError("Finish the current run before sending attachments.");
      return;
    }
    setThreadPrompt("");
    setAttachedFiles([]);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    if (effectiveThreadBusy) {
      await steerTurn(request.prompt);
      return;
    }
    await runTask(request);
  }

  async function queueSelectedThreadPrompt() {
    const request = buildSelectedThreadRunRequest({
      attachedFiles,
      selectedThread,
      threadPrompt,
    });
    if (!request) {
      return;
    }
    if (attachedFiles.length > 0) {
      setTaskError("Finish the current run before sending attachments.");
      return;
    }
    setThreadPrompt("");
    setAttachedFiles([]);
    requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
    await queueTurnInput(request.prompt);
  }

  function submitDraftTask() {
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
    void runTask(request);
  }

  function submitFromComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void submitSelectedThreadPrompt();
  }

  return {
    draftPrompt,
    setDraftPrompt,
    threadPrompt,
    setThreadPrompt,
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
    submitFromComposerKey,
  };
}
