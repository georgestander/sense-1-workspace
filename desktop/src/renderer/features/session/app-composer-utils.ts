import type { DesktopThreadSnapshot } from "../../../main/contracts";

type DraftRunRequestParams = {
  attachedFiles: string[];
  draftPrompt: string;
  workInFolder: boolean;
  workspaceFolder: string | null;
};

type SelectedThreadRunRequestParams = {
  attachedFiles: string[];
  selectedThread: DesktopThreadSnapshot | null;
  threadPrompt: string;
};

export function buildSelectedThreadRunRequest({
  attachedFiles,
  selectedThread,
  threadPrompt,
}: SelectedThreadRunRequestParams) {
  const prompt = threadPrompt.trim();
  if (!selectedThread || !prompt) {
    return null;
  }

  return {
    attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    cwd: selectedThread.cwd ?? selectedThread.workspaceRoot ?? null,
    prompt,
    threadId: selectedThread.id,
    workspaceRoot: selectedThread.workspaceRoot,
  };
}

export function buildDraftRunRequest({
  attachedFiles,
  draftPrompt,
  workInFolder,
  workspaceFolder,
}: DraftRunRequestParams) {
  const prompt = draftPrompt.trim();
  if (!prompt) {
    return null;
  }

  if (workInFolder && !workspaceFolder) {
    return {
      needsFolderSelection: true as const,
    };
  }

  return {
    attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    prompt,
    workspaceRoot: workInFolder ? workspaceFolder : null,
  };
}
