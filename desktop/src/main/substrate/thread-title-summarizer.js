import {
  firstString,
} from "./substrate-store-core.js";

const PLACEHOLDER_THREAD_TITLES = new Set([
  "untitled thread",
  "new thread",
  "new task",
  "current thread",
]);

const GENERIC_THREAD_TITLE_PATTERNS = [
  /^(?:fix|review|check|inspect|look into|look at|use|continue|help)(?:\s+(?:this|it|that))?$/i,
  /^ask a clarifying question$/i,
  /^chat without a folder$/i,
  /^review the selected workspace$/i,
  /^inspect the current workspace(?: and summarize the structure)?$/i,
  /^write the requested change(?: inside the workspace)?$/i,
  /^apply the requested changes(?: inside the selected workspace)?$/i,
];

function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function trimStoredText(value, maxLength = 400) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength);
  const lastWordBoundary = truncated.lastIndexOf(" ");
  return (lastWordBoundary > 40 ? truncated.slice(0, lastWordBoundary) : truncated).trim();
}

function stripSkillMentions(value) {
  return normalizeWhitespace(value)
    .replace(/\[[^\]]*?\$[A-Za-z0-9_-]+[^\]]*?\]\([^)]+\)/g, " ")
    .replace(/\$[A-Za-z0-9_-]+\b/g, " ");
}

function firstSentence(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  const [sentence] = normalized.split(/(?<=[.!?])\s+/);
  return sentence ?? normalized;
}

function stripPromptScaffolding(value) {
  let next = stripSkillMentions(value);
  next = next.replace(/^(?:please\s+|can you\s+|could you\s+|would you\s+|will you\s+|help me\s+|i need you to\s+|i want you to\s+|let(?:'|’)s\s+|lets\s+)/i, "");
  next = next.replace(/\b(?:in|inside)\s+(?:this|the selected|the current|an? empty)\s+workspace\b/ig, "");
  next = next.replace(/\bwithout a folder\b/ig, "");
  next = next.replace(/\bfor me\b/ig, "");
  return normalizeWhitespace(next)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[.!?]+$/, "");
}

function stripAssistantScaffolding(value) {
  let next = firstSentence(value);
  next = next.replace(
    /^(?:sure|absolutely|okay|ok|alright|got it|i(?:'|’)ll|i will|i(?:'|’)m going to|i am going to|let me|we(?:'|’)ll|we will)\s+/i,
    "",
  );
  next = next.replace(/^(?:start by|begin by)\s+/i, "");
  return stripPromptScaffolding(next);
}

function isPlaceholderThreadTitle(title) {
  const resolvedTitle = firstString(title);
  if (!resolvedTitle) {
    return true;
  }

  return PLACEHOLDER_THREAD_TITLES.has(resolvedTitle.toLowerCase());
}

function isGenericThreadTitle(title) {
  const resolvedTitle = normalizeWhitespace(title);
  if (!resolvedTitle) {
    return true;
  }

  if (isPlaceholderThreadTitle(resolvedTitle)) {
    return true;
  }

  if (GENERIC_THREAD_TITLE_PATTERNS.some((pattern) => pattern.test(resolvedTitle))) {
    return true;
  }

  const words = resolvedTitle.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.length < 3;
}

function clampTitle(value, maxLength = 72) {
  const normalized = normalizeWhitespace(value)
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[.!?]+$/, "");
  if (!normalized) {
    return null;
  }

  const formatTitle = (title) => title.charAt(0).toUpperCase() + title.slice(1);

  if (normalized.length <= maxLength) {
    return formatTitle(normalized);
  }

  const truncated = normalized.slice(0, maxLength);
  const lastWordBoundary = truncated.lastIndexOf(" ");
  return formatTitle((lastWordBoundary > 30 ? truncated.slice(0, lastWordBoundary) : truncated).trim());
}

function normalizeSeedTitle(title) {
  const resolvedTitle = firstString(title);
  if (!resolvedTitle || isPlaceholderThreadTitle(resolvedTitle)) {
    return null;
  }

  return resolvedTitle;
}

export function buildThreadTitleContext(existingContext, {
  assistantText = null,
  autoTitle = null,
  initialPrompt = null,
  seedTitle = null,
  userText = null,
} = {}) {
  const current =
    existingContext && typeof existingContext === "object"
      ? existingContext
      : {};

  const nextContext = {
    initialPrompt: firstString(current.initialPrompt, trimStoredText(initialPrompt)),
    seedTitle: firstString(current.seedTitle, normalizeSeedTitle(seedTitle)),
    userText: firstString(current.userText, trimStoredText(userText)),
    assistantText: firstString(current.assistantText, trimStoredText(assistantText)),
    autoTitle: firstString(current.autoTitle, clampTitle(autoTitle)),
  };

  return Object.fromEntries(
    Object.entries(nextContext).filter(([, value]) => typeof value === "string" && value.trim()),
  );
}

export function shouldAutoRenameThreadTitle({
  currentTitle,
  titleContext,
}) {
  const resolvedCurrentTitle = firstString(currentTitle);
  const resolvedAssistantText = firstString(titleContext?.assistantText);
  if (!resolvedAssistantText) {
    return false;
  }

  if (isPlaceholderThreadTitle(resolvedCurrentTitle)) {
    return true;
  }

  const seedTitle = firstString(titleContext?.seedTitle);
  return Boolean(seedTitle && resolvedCurrentTitle === seedTitle);
}

export function summarizeEarlyConversationThreadTitle(titleContext) {
  const promptCandidate = clampTitle(
    stripPromptScaffolding(firstString(titleContext?.userText, titleContext?.initialPrompt)),
  );
  const assistantCandidate = clampTitle(
    stripAssistantScaffolding(titleContext?.assistantText),
  );

  if (!promptCandidate && !assistantCandidate) {
    return null;
  }

  if (!isGenericThreadTitle(promptCandidate)) {
    return promptCandidate;
  }

  if (!isGenericThreadTitle(assistantCandidate)) {
    return assistantCandidate;
  }

  return promptCandidate || assistantCandidate;
}
