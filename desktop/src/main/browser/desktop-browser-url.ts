export function normalizeBrowserUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === "about:blank") {
    return trimmed;
  }
  if (/^localhost(?::\d+)?(?:\/.*)?$/i.test(trimmed) || /^127\.0\.0\.1(?::\d+)?(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (["http:", "https:", "file:"].includes(parsed.protocol)) {
      return parsed.href;
    }
  } catch {
    try {
      const parsed = new URL(`https://${trimmed}`);
      if (parsed.hostname.includes(".")) {
        return parsed.href;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveOrigin(rawUrl: string): string | null {
  const normalized = normalizeBrowserUrl(rawUrl);
  if (!normalized) {
    return null;
  }
  if (normalized === "about:blank") {
    return "about:blank";
  }
  const parsed = new URL(normalized);
  if (parsed.protocol === "file:") {
    return "file://";
  }
  return parsed.origin;
}

export function normalizeOrigin(origin: string): string | null {
  if (origin === "about:blank" || origin === "file://") {
    return origin;
  }
  try {
    const parsed = new URL(origin);
    return parsed.origin;
  } catch {
    return null;
  }
}
