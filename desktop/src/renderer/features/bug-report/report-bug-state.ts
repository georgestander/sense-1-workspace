import type {
  DesktopBugAttachment,
  DesktopBugCorrelation,
  DesktopBugReportDraft,
  DesktopBugReportResult,
  DesktopBugSeverity,
} from "../../../shared/contracts/bug-reporting.js";

export type ReportBugPhase = "idle" | "submitting" | "success" | "error";

export interface ReportBugDraft {
  title: string;
  description: string;
  expectedBehavior: string;
  reproductionSteps: string;
  severity: DesktopBugSeverity | "";
  attachments: DesktopBugAttachment[];
}

export interface ReportBugState {
  phase: ReportBugPhase;
  draft: ReportBugDraft;
  errorMessage: string | null;
  result: DesktopBugReportResult | null;
}

export const EMPTY_DRAFT: ReportBugDraft = {
  title: "",
  description: "",
  expectedBehavior: "",
  reproductionSteps: "",
  severity: "",
  attachments: [],
};

export const INITIAL_STATE: ReportBugState = {
  phase: "idle",
  draft: EMPTY_DRAFT,
  errorMessage: null,
  result: null,
};

export function canSubmit(draft: ReportBugDraft): boolean {
  return draft.title.trim().length > 0 && draft.description.trim().length > 0;
}

export function buildDraftPayload(
  draft: ReportBugDraft,
  correlation: DesktopBugCorrelation | null = null,
): DesktopBugReportDraft {
  const expected = draft.expectedBehavior.trim();
  const reproduction = draft.reproductionSteps.trim();
  return {
    reportType: "manual",
    title: draft.title.trim(),
    description: draft.description.trim(),
    expectedBehavior: expected.length > 0 ? expected : null,
    reproductionSteps: reproduction.length > 0 ? reproduction : null,
    severity: draft.severity === "" ? null : draft.severity,
    attachments: draft.attachments,
    correlation,
  };
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif", "avif"]);
const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

export function inferAttachmentFromPath(filePath: string): DesktopBugAttachment {
  const normalized = filePath.replace(/\\/gu, "/");
  const lastSegment = normalized.slice(normalized.lastIndexOf("/") + 1);
  const extension = lastSegment.includes(".")
    ? lastSegment.slice(lastSegment.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const isImage = IMAGE_EXTENSIONS.has(extension);
  return {
    kind: isImage ? "screenshot" : "file",
    path: filePath,
    mimeType: isImage ? (IMAGE_MIME_TYPES[extension] ?? null) : null,
  };
}

export function appendAttachments(
  current: DesktopBugAttachment[],
  additions: DesktopBugAttachment[],
): DesktopBugAttachment[] {
  const seen = new Set(current.map((entry) => entry.path));
  const next = [...current];
  for (const addition of additions) {
    if (seen.has(addition.path)) {
      continue;
    }
    seen.add(addition.path);
    next.push(addition);
  }
  return next;
}

export function removeAttachment(
  current: DesktopBugAttachment[],
  path: string,
): DesktopBugAttachment[] {
  return current.filter((entry) => entry.path !== path);
}

export function sanitizeReportErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '.*?':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .trim();
}
