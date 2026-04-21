import { resolveInputItemPromptShortcutMatches } from "./prompt-shortcuts.ts";

export type DesktopUserMessageAttachment = {
  kind: "file" | "image";
  label: string;
  path: string;
};

const ATTACHMENT_CONTEXT_OPEN = "<sense1-attachment-context>";
const ATTACHMENT_CONTEXT_CLOSE = "</sense1-attachment-context>";

const IMAGE_EXTENSIONS = new Set([
  ".apng",
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

function firstString(...values: unknown[]): string | null {
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

export function fileNameFromPath(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

export function isImageAttachmentPath(value: string): boolean {
  const fileName = fileNameFromPath(value).toLowerCase();
  const extensionIndex = fileName.lastIndexOf(".");
  if (extensionIndex < 0) {
    return false;
  }

  return IMAGE_EXTENSIONS.has(fileName.slice(extensionIndex));
}

export function buildAttachmentContextNote(attachmentPaths: string[]): string | null {
  const normalizedAttachments = attachmentPaths
    .map((attachmentPath) => firstString(attachmentPath))
    .filter((attachmentPath): attachmentPath is string => Boolean(attachmentPath));

  if (normalizedAttachments.length === 0) {
    return null;
  }

  return [
    ATTACHMENT_CONTEXT_OPEN,
    "The user attached these files for this request. Treat them as part of the task even when they live outside the current workspace.",
    ...normalizedAttachments.map((attachmentPath) => `- ${fileNameFromPath(attachmentPath)} :: ${attachmentPath}`),
    ATTACHMENT_CONTEXT_CLOSE,
  ].join("\n");
}

export function stripAttachmentContextNote(text: string): string {
  if (!text.includes(ATTACHMENT_CONTEXT_OPEN)) {
    return text.trim();
  }

  const pattern = new RegExp(
    `${ATTACHMENT_CONTEXT_OPEN}[\\s\\S]*?${ATTACHMENT_CONTEXT_CLOSE}\\s*`,
    "g",
  );

  return text
    .replace(pattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveUserMessageAttachments(content: unknown): DesktopUserMessageAttachment[] {
  const normalizedContent = Array.isArray(content) ? content : [];
  const shortcutMatches = resolveInputItemPromptShortcutMatches(normalizedContent);
  const shortcutItems = new Set(shortcutMatches.map((match) => match.item));

  return normalizedContent.flatMap((entry) => {
    const entryPath = firstString(entry?.path);
    if (!entryPath) {
      return [];
    }

    if (entry?.type === "localImage") {
      return [{
        kind: "image",
        label: fileNameFromPath(entryPath),
        path: entryPath,
      }];
    }

    if (entry?.type === "mention" && !shortcutItems.has(entry)) {
      return [{
        kind: isImageAttachmentPath(entryPath) ? "image" : "file",
        label: firstString(entry?.name) ?? fileNameFromPath(entryPath),
        path: entryPath,
      }];
    }

    return [];
  });
}
