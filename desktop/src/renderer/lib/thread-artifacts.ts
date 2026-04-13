function normalizeCandidate(value: string): string {
  return value.trim().replace(/[),.]+$/, "");
}

function isExternalUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

function isAbsoluteArtifactPath(target: string): boolean {
  return target.startsWith("/") || /^[A-Za-z]:\\/.test(target);
}

function isRelativeArtifactPath(target: string): boolean {
  return target.startsWith("./") || target.startsWith("../") || target.startsWith("~/");
}

function looksLikeBareFilename(target: string): boolean {
  return /^[^\s\\/`]+\.[A-Za-z0-9]{1,8}$/.test(target);
}

function looksLikeArtifactTarget(target: string): boolean {
  if (/[\[\]()]/.test(target)) {
    return false;
  }

  if (/\s/.test(target) && !isAbsoluteArtifactPath(target) && !isRelativeArtifactPath(target)) {
    return false;
  }

  return isAbsoluteArtifactPath(target)
    || isRelativeArtifactPath(target)
    || /[\\/]/.test(target)
    || looksLikeBareFilename(target);
}

function unwrapStandaloneArtifactLine(line: string): string | null {
  const withoutBullet = line.trim().replace(/^[-*]\s+/, "");
  if (!withoutBullet) {
    return null;
  }

  const inlineCodeMatch = withoutBullet.match(/^`([^`]+)`$/);
  return normalizeCandidate(inlineCodeMatch ? inlineCodeMatch[1] : withoutBullet);
}

export function resolveArtifactPath(target: string, workspaceRoot: string | null | undefined): string | null {
  const normalized = normalizeCandidate(target);
  if (!normalized || isExternalUrl(normalized)) {
    return null;
  }

  if (isAbsoluteArtifactPath(normalized)) {
    return normalized;
  }

  if (!workspaceRoot?.trim()) {
    return null;
  }

  const normalizedRoot = workspaceRoot.replace(/[\\/]+$/, "");
  const normalizedTarget = normalized
    .replace(/^[~][\\/]/, "")
    .replace(/^[.][\\/]/, "")
    .replace(/^[\\/]+/, "");

  return `${normalizedRoot}/${normalizedTarget}`;
}

export function extractStandaloneArtifactTarget(line: string): string | null {
  const candidate = unwrapStandaloneArtifactLine(line);
  if (!candidate || !looksLikeArtifactTarget(candidate)) {
    return null;
  }

  return candidate;
}

export function extractArtifactPathsFromText(text: string, workspaceRoot: string | null | undefined): string[] {
  if (!text.trim()) {
    return [];
  }

  const resolvedPaths: string[] = [];
  const seen = new Set<string>();
  const rememberPath = (candidate: string | null) => {
    if (!candidate) {
      return;
    }

    const resolvedPath = resolveArtifactPath(candidate, workspaceRoot);
    if (!resolvedPath || seen.has(resolvedPath)) {
      return;
    }

    seen.add(resolvedPath);
    resolvedPaths.push(resolvedPath);
  };

  const markdownLinkPattern = /\[[^\]]*]\(([^)\n]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    rememberPath(match[1] ?? null);
  }

  for (const line of text.split(/\r?\n/)) {
    rememberPath(extractStandaloneArtifactTarget(line));
  }

  return resolvedPaths;
}
