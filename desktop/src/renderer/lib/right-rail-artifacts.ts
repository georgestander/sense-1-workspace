function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function trimRelativePrefix(value: string): string {
  return value.replace(/^(?:\.\.?\/)+/, "");
}

function normalizeWorkspaceRoot(rootPath: string): string {
  const normalizedRoot = normalizeSlashes(rootPath.trim());
  if (/^[A-Za-z]:\/$/.test(normalizedRoot) || normalizedRoot === "/") {
    return normalizedRoot;
  }

  return normalizedRoot.replace(/\/+$/, "");
}

function normalizeWorkspaceRoots(
  workspaceRoot: string | readonly string[] | null | undefined,
): string[] {
  const candidates = Array.isArray(workspaceRoot) ? workspaceRoot : [workspaceRoot];
  const normalizedRoots = candidates
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0)
    .map((candidate) => normalizeWorkspaceRoot(candidate))
    .filter(Boolean);

  return Array.from(new Set(normalizedRoots));
}

function normalizeRelativePath(
  filePath: string,
  workspaceRoot: string | readonly string[] | null | undefined,
): string | null {
  const trimmedPath = typeof filePath === "string" ? filePath.trim() : "";
  if (!trimmedPath) {
    return null;
  }

  const normalizedPath = normalizeSlashes(trimmedPath);
  const normalizedRoots = normalizeWorkspaceRoots(workspaceRoot);

  if (/^(?:[A-Za-z]:\/|\/)/.test(normalizedPath)) {
    if (normalizedRoots.length === 0) {
      return null;
    }

    for (const normalizedRoot of normalizedRoots) {
      if (normalizedPath === normalizedRoot) {
        return "";
      }

      if (normalizedRoot === "/" && normalizedPath.startsWith("/")) {
        return normalizedPath.slice(1);
      }

      if (/^[A-Za-z]:\/$/.test(normalizedRoot) && normalizedPath.startsWith(normalizedRoot)) {
        return normalizedPath.slice(normalizedRoot.length);
      }

      if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
        return normalizedPath.slice(normalizedRoot.length + 1);
      }
    }
    return null;
  }

  return trimRelativePrefix(normalizedPath).replace(/^\/+/, "");
}

const HIDDEN_SEGMENT_NAMES = new Set([
  ".git",
  ".agent",
  ".omx",
]);

const RUNTIME_SUPPORT_SEGMENT_NAMES = new Set([
  "logs",
  "log",
  "observability",
  "output",
  "rendered",
  "retrieval",
]);

const HIDDEN_NAME_PATTERNS = [
  /^\.ds_store$/i,
  /\.ndjson$/i,
  /^session\.json$/i,
  /^summary\.md$/i,
  /\.tmp$/i,
];

const USER_FACING_RUNTIME_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".svg",
  ".tsv",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
]);

function fileExtension(filePath: string): string {
  const match = /\.[^.]+$/.exec(filePath);
  return match ? match[0].toLowerCase() : "";
}

export function isVisibleRightRailArtifactPath(
  filePath: string,
  workspaceRoot: string | readonly string[] | null | undefined,
): boolean {
  const relativePath = normalizeRelativePath(filePath, workspaceRoot);
  if (relativePath == null) {
    return false;
  }

  if (!relativePath) {
    return false;
  }

  const segments = relativePath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  const leafName = segments.at(-1) ?? "";
  if (segments.some((segment) => HIDDEN_SEGMENT_NAMES.has(segment.toLowerCase()))) {
    return false;
  }

  if (HIDDEN_NAME_PATTERNS.some((pattern) => pattern.test(leafName))) {
    return false;
  }

  const hasRuntimeSupportSegment = segments.some((segment) => RUNTIME_SUPPORT_SEGMENT_NAMES.has(segment.toLowerCase()));
  if (!hasRuntimeSupportSegment) {
    return true;
  }

  return USER_FACING_RUNTIME_EXTENSIONS.has(fileExtension(leafName));
}

export function filterVisibleRightRailArtifactPaths(
  filePaths: string[],
  workspaceRoot: string | readonly string[] | null | undefined,
): string[] {
  return filePaths.filter((filePath) => isVisibleRightRailArtifactPath(filePath, workspaceRoot));
}
