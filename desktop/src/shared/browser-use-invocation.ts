export interface BrowserUseContext {
  readonly threadId: string;
  readonly url: string | null;
  readonly title: string | null;
}

export interface BrowserUseShortcutSuggestion {
  readonly label: "Browser Use";
  readonly token: "browser-use";
  readonly description: string;
}

const BROWSER_USE_MENTION_PATTERN = /(^|\s)@\s*(?:browseruse|browser-use|browser\s+use)\b/iu;
const BROWSER_USE_SHORTCUT: BrowserUseShortcutSuggestion = {
  label: "Browser Use",
  token: "browser-use",
  description: "Operate the in-app browser for this thread",
};

export function hasBrowserUseMention(prompt: string): boolean {
  return BROWSER_USE_MENTION_PATTERN.test(prompt);
}

export function stripBrowserUseMention(prompt: string): string {
  return prompt.replace(BROWSER_USE_MENTION_PATTERN, "$1").replace(/\s{2,}/g, " ").trim();
}

export function stripBrowserUseTranscriptText(prompt: string): string {
  if (!hasBrowserUseMention(prompt)) {
    return prompt;
  }

  return prompt.replace(BROWSER_USE_MENTION_PATTERN, "$1")
    .split(/\r?\n/u)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed
        && !trimmed.startsWith("Use the Sense-1 in-app browser")
        && !trimmed.startsWith("Thread:")
        && !trimmed.startsWith("URL:")
        && !trimmed.startsWith("Title:")
        && !trimmed.startsWith("If the origin is not allowed yet");
    })
    .join("\n")
    .trim();
}

export function buildBrowserUsePrompt(prompt: string, context: BrowserUseContext): string {
  const strippedPrompt = stripBrowserUseMention(prompt);
  const task = strippedPrompt || "Inspect and operate the current in-app browser page.";
  return [
    "@Browser Use",
    "Use the Sense-1 in-app browser, not the external system browser.",
    `Thread: ${context.threadId}`,
    `URL: ${context.url ?? "about:blank"}`,
    `Title: ${context.title ?? "unknown"}`,
    "If the origin is not allowed yet, ask me to approve Browser Use before clicking, typing, or inspecting.",
    "",
    task,
  ].join("\n");
}

export function resolveActiveBrowserUseShortcutSuggestion(
  prompt: string,
  cursorIndex = prompt.length,
): BrowserUseShortcutSuggestion | null {
  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, prompt.length));
  const beforeCursor = prompt.slice(0, safeCursorIndex);
  const match = /(^|\s)@([A-Za-z0-9_-]*)$/u.exec(beforeCursor);
  if (!match) {
    return null;
  }

  const query = (match[2] ?? "").toLowerCase();
  const keys = ["browser", "browseruse", "browser-use"];
  return keys.some((key) => key.startsWith(query)) ? BROWSER_USE_SHORTCUT : null;
}

export function replaceActiveBrowserUseShortcut(
  prompt: string,
  cursorIndex = prompt.length,
): { prompt: string; cursorIndex: number } {
  const safeCursorIndex = Math.max(0, Math.min(cursorIndex, prompt.length));
  const beforeCursor = prompt.slice(0, safeCursorIndex);
  const match = /(^|\s)@([A-Za-z0-9_-]*)$/u.exec(beforeCursor);
  if (!match) {
    return { prompt, cursorIndex: safeCursorIndex };
  }

  const prefix = beforeCursor.slice(0, match.index);
  const leading = match[1] ?? "";
  const suffix = prompt.slice(safeCursorIndex);
  const shouldInsertTrailingSpace = suffix.length === 0 || !/^\s/u.test(suffix);
  const replacement = `${leading}@browser-use${shouldInsertTrailingSpace ? " " : ""}`;
  const nextPrompt = `${prefix}${replacement}${suffix}`;
  return {
    prompt: nextPrompt,
    cursorIndex: prefix.length + replacement.length,
  };
}
