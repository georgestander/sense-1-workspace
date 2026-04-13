function firstString(...values) {
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

function normalizePersonality(value, fallback = "friendly") {
  const resolved = firstString(value);
  if (resolved === "none" || resolved === "friendly" || resolved === "pragmatic") {
    return resolved;
  }

  if (resolved === "concise" || resolved === "formal" || resolved === "detailed") {
    return "pragmatic";
  }

  return fallback;
}

const LIGHTWEIGHT_INTENT_PATTERNS = Object.freeze([
  /\bbrainstorm(?:ing)?\b/i,
  /\bsummar(?:ize|y)\b/i,
  /\bexplain\b/i,
  /\bcompare\b/i,
  /\bdiscuss\b/i,
  /\btradeoffs?\b/i,
  /\bideas?\b/i,
  /\boptions?\b/i,
  /\brefin(?:e|ing)\b.{0,20}\bbrief\b/i,
  /\bdecid(?:e|ing)\b.{0,40}\bwhat\b.{0,20}\bwant\b/i,
  /\boutline\b/i,
  /\bhelp me think\b/i,
  /^\s*(what|why|how|can|could|would|should|is|are|do|does|did)\b/i,
]);

const GREETING_PATTERNS = Object.freeze([
  /^\s*(?:hi|hello|hey)(?:\s+(?:there|sense-?1|team|folks))?[!.?,\s]*$/i,
  /^\s*good\s+(?:morning|afternoon|evening)[!.?,\s]*$/i,
]);

const CONVERSATIONAL_OVERRIDE_PATTERNS = Object.freeze([
  /\bthink\s+we\s+should\b/i,
  /\bdo\s+you\s+think\s+we\s+should\b/i,
  /\b(?:can|could|would)\s+you\s+(?:talk|walk)\s+through\b/i,
  /\b(?:talk|walk)\s+through\b/i,
  /\bno\s+edits?\s+yet\b/i,
  /^\s*how\s+(?:do|would|should|can)\b/i,
]);

const PROJECT_INSPECTION_PATTERNS = Object.freeze([
  /\b(review|inspect|scan|audit|analy[sz]e|look through|go through|read through|map)\b.{0,40}\b(codebase|repo|repository|project|workspace|files?|folder|source|structure)\b/i,
  /\b(tell me|show me)\b.{0,40}\bwhat\b.{0,20}\b(change|fix|improve|refactor)\b/i,
]);

const EXECUTION_INTENT_PATTERNS = Object.freeze([
  /\bbuild\b/i,
  /\bcreate\b/i,
  /\bwrite\b/i,
  /\bedit\b/i,
  /\bmodify\b/i,
  /\bupdate\b/i,
  /\bchange\b/i,
  /\bfix\b/i,
  /\brefactor\b/i,
  /\bimplement\b/i,
  /\bgenerate\b/i,
  /\brun\b/i,
  /\binstall\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\brename\b/i,
  /\breplace\b/i,
  /\bpublish\b/i,
  /\bdeploy\b/i,
  /\bsync\b/i,
  /\bscaffold\b/i,
  /\bset up\b/i,
  /\bsetup\b/i,
  /\bmake\b.{0,40}\b(page|component|app|project|file|folder|site)\b/i,
]);

const READ_ONLY_OVERRIDE_PATTERNS = Object.freeze([
  /\bdo\s+not\s+(change|modify|edit|touch|alter|write|delete|create|update|remove|inspect)\b/i,
  /\bdon'?t\s+(change|modify|edit|touch|alter|write|delete|create|update|remove|inspect)\b/i,
  /\bwithout\s+(changing|modifying|editing|touching|altering|writing|creating|updating|deleting|removing)\b/i,
  /\bno\s+(changes?|modifications?|edits?|file\s+changes?)\b/i,
  /\bread[\s-]?only\b/i,
]);

export {
  firstString,
  normalizePersonality,
};

export function classifyDesktopExecutionIntent({
  prompt = null,
  workspaceRoot = null,
} = {}) {
  const resolvedPrompt = firstString(prompt);
  const resolvedWorkspaceRoot = firstString(workspaceRoot);

  if (!resolvedPrompt) {
    return {
      kind: "lightweightConversation",
      matchedRule: "empty-prompt-default",
      reason: "Prompts without executable content default to lightweight conversation.",
      workspaceBound: false,
    };
  }

  const hasExecutionSignal = EXECUTION_INTENT_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const hasLightweightSignal = LIGHTWEIGHT_INTENT_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const hasGreetingSignal = GREETING_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const hasConversationalOverride = CONVERSATIONAL_OVERRIDE_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const hasProjectInspectionSignal = PROJECT_INSPECTION_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const hasReadOnlyOverride = READ_ONLY_OVERRIDE_PATTERNS.some((pattern) => pattern.test(resolvedPrompt));
  const workspaceBound = Boolean(resolvedWorkspaceRoot);

  if (hasReadOnlyOverride) {
    return {
      kind: "lightweightConversation",
      matchedRule: workspaceBound ? "workspace-readonly-override" : "readonly-override",
      reason: "The prompt contains an explicit read-only directive that overrides incidental execution-sounding words.",
      workspaceBound,
    };
  }

  if (hasGreetingSignal) {
    return {
      kind: "lightweightConversation",
      matchedRule: "greeting",
      reason: "Greetings stay in conversation mode until the user clearly asks Sense-1 to act.",
      workspaceBound,
    };
  }

  if (hasConversationalOverride) {
    return {
      kind: "lightweightConversation",
      matchedRule: "conversation-override",
      reason: "Conversational framing keeps this turn in discussion mode unless the user clearly asks Sense-1 to execute work.",
      workspaceBound,
    };
  }

  if (hasExecutionSignal) {
    return {
      kind: "executionIntent",
      matchedRule: "execution-keyword",
      reason: workspaceBound
        ? "This prompt clearly asks Sense-1 to perform work in the selected workspace."
        : "This prompt clearly asks Sense-1 to perform work rather than only discuss it.",
      workspaceBound,
    };
  }

  if (hasLightweightSignal) {
    return {
      kind: "lightweightConversation",
      matchedRule: "lightweight-keyword",
      reason: "This prompt asks for discussion, explanation, or ideation without clearly requesting execution.",
      workspaceBound,
    };
  }

  if (hasProjectInspectionSignal) {
    return {
      kind: "lightweightConversation",
      matchedRule: "project-inspection-conversation",
      reason: "Reviewing or inspecting a project without asking for changes stays in conversation mode.",
      workspaceBound,
    };
  }

  return {
    kind: "lightweightConversation",
    matchedRule: "chat-default",
    reason: workspaceBound
      ? "Workspace turns stay conversational unless the user clearly asks Sense-1 to execute work."
      : "Chat-only turns default to lightweight conversation unless they clearly imply execution.",
    workspaceBound,
  };
}
