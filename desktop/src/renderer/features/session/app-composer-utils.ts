import type { DesktopAppServerInputItem, DesktopThreadSnapshot } from "../../../main/contracts";
import { extractPromptShortcutTokens, resolveInputItemPromptShortcutMatches } from "../../../shared/prompt-shortcuts.ts";

type DraftRunRequestParams = {
  attachedFiles: string[];
  draftPrompt: string;
  inputItems?: DesktopAppServerInputItem[];
  workInFolder: boolean;
  workspaceFolder: string | null;
};

type SelectedThreadRunRequestParams = {
  attachedFiles: string[];
  inputItems?: DesktopAppServerInputItem[];
  selectedThread: DesktopThreadSnapshot | null;
  threadPrompt: string;
};

type SelectedThreadBusyActionParams = {
  canSteerSelectedThread: boolean;
  effectiveThreadBusy: boolean;
};

function retainPromptShortcutInputItems(
  prompt: string,
  inputItems: DesktopAppServerInputItem[] | undefined,
): DesktopAppServerInputItem[] | undefined {
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    return undefined;
  }

  const promptTokens = new Set(extractPromptShortcutTokens(prompt));
  if (promptTokens.size === 0) {
    return undefined;
  }

  const retained = resolveInputItemPromptShortcutMatches(inputItems)
    .filter((match) => promptTokens.has(match.token))
    .map((match) => match.item);

  return retained.length > 0 ? retained : undefined;
}

export function buildSelectedThreadRunRequest({
  attachedFiles,
  inputItems,
  selectedThread,
  threadPrompt,
}: SelectedThreadRunRequestParams) {
  const prompt = threadPrompt.trim();
  if (!selectedThread || !prompt) {
    return null;
  }

  const retainedInputItems = retainPromptShortcutInputItems(prompt, inputItems);
  return {
    attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    cwd: selectedThread.cwd ?? selectedThread.workspaceRoot ?? null,
    ...(retainedInputItems ? { inputItems: retainedInputItems } : {}),
    prompt,
    threadId: selectedThread.id,
    workspaceRoot: selectedThread.workspaceRoot,
  };
}

export function shouldUseSelectedThreadBusyActions({
  canSteerSelectedThread,
  effectiveThreadBusy,
}: SelectedThreadBusyActionParams): boolean {
  return canSteerSelectedThread || effectiveThreadBusy;
}

export function buildDraftRunRequest({
  attachedFiles,
  draftPrompt,
  inputItems,
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

  const retainedInputItems = retainPromptShortcutInputItems(prompt, inputItems);
  return {
    attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined,
    ...(retainedInputItems ? { inputItems: retainedInputItems } : {}),
    prompt,
    workspaceRoot: workInFolder ? workspaceFolder : null,
  };
}
