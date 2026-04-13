import fs from "node:fs/promises";
import path from "node:path";

import type { DesktopInputQuestion } from "../contracts";
import { isPathWithinRoot } from "../workspace/workspace-boundary.ts";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function normalizeInputChoice(choice: unknown): DesktopInputQuestion["choices"][number] | null {
  const record = asRecord(choice);
  const label = firstString(record?.label, record?.text, record?.name, record?.value);
  if (!label) {
    return null;
  }

  return {
    label,
    description: firstString(record?.description),
    value: firstString(record?.value, record?.label, record?.text, record?.name) || label,
  };
}

function isInputChoice(
  choice: DesktopInputQuestion["choices"][number] | null,
): choice is DesktopInputQuestion["choices"][number] {
  return choice !== null;
}

function normalizeInputQuestion(question: unknown): DesktopInputQuestion | null {
  const record = asRecord(question);
  const prompt = firstString(
    record?.question,
    record?.prompt,
    record?.text,
    record?.label,
    record?.header,
  );
  if (!prompt) {
    return null;
  }

  const rawChoices = Array.isArray(record?.choices)
    ? record.choices
    : Array.isArray(record?.options)
      ? record.options
      : [];

  return {
    id: firstString(record?.id),
    header: firstString(record?.header),
    question: prompt,
    isOther: record?.isOther === true,
    choices: rawChoices.map((choice) => normalizeInputChoice(choice)).filter(isInputChoice),
  };
}

function isInputQuestion(question: DesktopInputQuestion | null): question is DesktopInputQuestion {
  return question !== null;
}

function normalizeInputQuestions(questions: unknown): DesktopInputQuestion[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => normalizeInputQuestion(question)).filter(isInputQuestion);
}

export function questionsFromMetadata(metadata: unknown): DesktopInputQuestion[] {
  return normalizeInputQuestions(asRecord(metadata)?.questions);
}

export function promptSummary(prompt: string): string | null {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    return null;
  }

  const singleLine = trimmed.replace(/\s+/g, " ");
  if (singleLine.length <= 120) {
    return singleLine;
  }

  return `${singleLine.slice(0, 117).trimEnd()}...`;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveAttachmentCopyDestination(
  sessionArtifactRoot: string,
  sourcePath: string,
): Promise<string> {
  const fileName = path.basename(sourcePath);
  const extension = path.extname(fileName);
  const stem = extension ? fileName.slice(0, -extension.length) : fileName;
  let destinationPath = path.join(sessionArtifactRoot, fileName);
  let counter = 2;

  while (await pathExists(destinationPath)) {
    destinationPath = path.join(sessionArtifactRoot, `${stem}-${counter}${extension}`);
    counter += 1;
  }

  return destinationPath;
}

export async function normalizeAttachmentPaths({
  attachments,
  sessionArtifactRoot,
  workspaceRoot = null,
}: {
  attachments?: string[];
  sessionArtifactRoot: string;
  workspaceRoot?: string | null;
}): Promise<string[]> {
  const normalizedAttachments = [];
  const copiedAttachmentsBySource = new Map<string, string>();
  const createdCopies = [];
  const resolvedWorkspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : null;
  const resolvedSessionArtifactRoot = path.resolve(sessionArtifactRoot);

  try {
    for (const attachmentPath of Array.isArray(attachments) ? attachments : []) {
      const trimmedAttachmentPath = typeof attachmentPath === "string" ? attachmentPath.trim() : "";
      if (!trimmedAttachmentPath) {
        continue;
      }

      const resolvedAttachmentPath = path.resolve(trimmedAttachmentPath);
      if (
        (resolvedWorkspaceRoot && isPathWithinRoot(resolvedAttachmentPath, resolvedWorkspaceRoot))
        || isPathWithinRoot(resolvedAttachmentPath, resolvedSessionArtifactRoot)
      ) {
        normalizedAttachments.push(resolvedAttachmentPath);
        continue;
      }

      const existingCopiedPath = copiedAttachmentsBySource.get(resolvedAttachmentPath);
      if (existingCopiedPath) {
        normalizedAttachments.push(existingCopiedPath);
        continue;
      }

      await fs.mkdir(resolvedSessionArtifactRoot, { recursive: true });
      const copiedAttachmentPath = await resolveAttachmentCopyDestination(
        resolvedSessionArtifactRoot,
        resolvedAttachmentPath,
      );

      try {
        await fs.copyFile(resolvedAttachmentPath, copiedAttachmentPath);
      } catch {
        throw new Error(
          `Could not attach file: ${path.basename(resolvedAttachmentPath)}. The file may not be accessible.`,
        );
      }

      copiedAttachmentsBySource.set(resolvedAttachmentPath, copiedAttachmentPath);
      createdCopies.push(copiedAttachmentPath);
      normalizedAttachments.push(copiedAttachmentPath);
    }

    return normalizedAttachments;
  } catch (error) {
    await Promise.allSettled(
      createdCopies.map((copiedAttachmentPath) => fs.rm(copiedAttachmentPath, { force: true })),
    );
    throw error;
  }
}
