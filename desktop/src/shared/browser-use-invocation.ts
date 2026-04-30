export interface BrowserUseContext {
  readonly threadId: string;
  readonly url: string | null;
  readonly title: string | null;
}

const BROWSER_USE_MENTION_PATTERN = /(^|\s)@\s*(?:browser-use|browser\s+use)\b/iu;

export function hasBrowserUseMention(prompt: string): boolean {
  return BROWSER_USE_MENTION_PATTERN.test(prompt);
}

export function stripBrowserUseMention(prompt: string): string {
  return prompt.replace(BROWSER_USE_MENTION_PATTERN, "$1").replace(/\s{2,}/g, " ").trim();
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
