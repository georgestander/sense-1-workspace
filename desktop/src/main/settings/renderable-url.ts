/**
 * Allowlist of URL schemes the renderer can safely load via <img src>, CSS
 * url(), etc. Any other scheme is returned as null so the consumer falls back
 * to its default (usually a placeholder icon) instead of triggering a
 * Chromium `ERR_UNKNOWN_URL_SCHEME` console error.
 *
 * The codex app-server sometimes emits URLs with internal schemes such as
 * `connectors://...` on `app/list` responses. Those URLs have no local handler
 * in the desktop shell, so they must be stripped before reaching the
 * renderer. If a scheme is ever added (e.g. a registered protocol handler for
 * `connectors://`), extend RENDERABLE_URL_SCHEMES below and the URL will pass
 * through untouched.
 */
const RENDERABLE_URL_SCHEMES = new Set(["http:", "https:", "data:"]);

export function sanitizeRenderableUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  // Absolute URLs with a scheme.
  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+\-.]*):/iu);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    return RENDERABLE_URL_SCHEMES.has(scheme) ? trimmed : null;
  }
  // Protocol-relative URL (`//host/path`) — treated as https by Chromium.
  if (trimmed.startsWith("//")) {
    return trimmed;
  }
  // Relative paths are reserved for renderer-side routing and should not be
  // piped into <img src>; drop them here to avoid accidental current-origin
  // fetches.
  return null;
}

export const __testing__ = {
  RENDERABLE_URL_SCHEMES,
};
