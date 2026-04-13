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

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

function asTextArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      const record = asRecord(entry);
      return firstString(record?.text, record?.value, record?.content);
    })
    .filter(Boolean);
}

function dedupeStrings(values) {
  return [...new Set(values.map((value) => firstString(value)).filter(Boolean))];
}

export function normalizeCommand(command) {
  if (Array.isArray(command)) {
    return command.filter((value) => typeof value === "string");
  }

  const resolved = firstString(command);
  return resolved ? [resolved] : [];
}

export function resolveFileChangePaths(item) {
  if (item?.type === "fileChange" && Array.isArray(item.changes)) {
    return item.changes
      .map((change) => asRecord(change))
      .filter(Boolean)
      .map((change) => ({
        kind: firstString(change.kind) || "modified",
        path: firstString(change.path),
      }))
      .filter((change) => change.path);
  }

  return [];
}

export function resolveDiffPaths(params) {
  const diffs = Array.isArray(params?.diffs) ? params.diffs : [];
  return diffs
    .map((diff) => asRecord(diff))
    .filter(Boolean)
    .map((diff) => ({
      hunkCount: Array.isArray(diff.hunks) ? diff.hunks.length : 0,
      path: firstString(diff.path),
    }))
    .filter((diff) => diff.path);
}

function normalizeInputChoice(choice) {
  const record = asRecord(choice);
  const label = firstString(record?.label, record?.text, record?.name, record?.value);
  if (!label) {
    return null;
  }

  return {
    label,
    description: firstString(record?.description),
    value: firstString(record?.value, record?.label, record?.text, record?.name) || label,
  };
}

function normalizeInputQuestion(question) {
  const record = asRecord(question);
  const prompt = firstString(
    record?.question,
    record?.prompt,
    record?.text,
    record?.label,
    record?.header,
  );
  if (!prompt) {
    return null;
  }

  const rawChoices = Array.isArray(record?.choices)
    ? record.choices
    : Array.isArray(record?.options)
      ? record.options
      : [];
  const choices = rawChoices.map((choice) => normalizeInputChoice(choice)).filter(Boolean);

  return {
    id: firstString(record?.id),
    header: firstString(record?.header),
    question: prompt,
    isOther: record?.isOther === true,
    choices,
  };
}

export function normalizeInputQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.map((question) => normalizeInputQuestion(question)).filter(Boolean);
}

export function buildInputPrompt(questions, fallbackPrompt = null) {
  const resolvedFallbackPrompt = firstString(fallbackPrompt);
  if (resolvedFallbackPrompt) {
    return resolvedFallbackPrompt;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return "Sense-1 needs your input.";
  }

  const lines = [];
  for (const [index, question] of questions.entries()) {
    const header = firstString(question?.header);
    const prompt = firstString(question?.question);
    if (!prompt) {
      continue;
    }

    const prefix = header ? `${header}: ` : "";
    lines.push(questions.length > 1 ? `${index + 1}. ${prefix}${prompt}` : `${prefix}${prompt}`);
    if (Array.isArray(question?.choices) && question.choices.length > 0) {
      for (const [choiceIndex, choice] of question.choices.entries()) {
        const label = firstString(choice?.label);
        if (!label) {
          continue;
        }

        lines.push(`   ${choiceIndex + 1}. ${label}`);
      }
    }
    if (question?.isOther) {
      lines.push("   Other: allowed");
    }
  }

  return lines.length > 0 ? lines.join("\n") : "Sense-1 needs your input.";
}

export function resolveReviewSummary(item) {
  const review = asRecord(item?.review);
  return firstString(review?.summary, review?.text, review?.body);
}

export function collectItemText(item) {
  const parts = [];
  const directText = firstString(item?.text);
  if (directText) {
    parts.push(directText);
  }

  for (const summaryText of asTextArray(item?.summary)) {
    parts.push(summaryText);
  }

  const content = Array.isArray(item?.content) ? item.content : [];
  for (const entry of content) {
    const record = asRecord(entry);
    const text = firstString(record?.text, record?.value, record?.content);
    if (text) {
      parts.push(text);
    }
  }

  return parts.join("\n");
}

function extractAbsolutePathsFromText(text) {
  if (typeof text !== "string" || !text.trim()) {
    return [];
  }

  const candidates = new Set();
  const matcher = /(?:^|[\s"'`(])((?:\/|[A-Za-z]:\\)[^\s"'`<>|]+(?:\/[^\s"'`<>|]+)*)/g;
  for (const match of text.matchAll(matcher)) {
    const candidate = match[1]?.replace(/[),.]+$/, "");
    if (candidate && (candidate.startsWith("/") || /^[A-Za-z]:\\/.test(candidate))) {
      candidates.add(candidate);
    }
  }

  return [...candidates];
}

export function buildFileWriteActivities({
  changes,
  itemId,
  itemStatus,
  sessionId,
  threadId,
  ts,
}) {
  return dedupeStrings(changes.map((change) => change.path)).map((path) => ({
    detail: {
      action: changes.find((change) => change.path === path)?.kind || "modified",
      itemId,
      itemStatus,
      path,
    },
    kind: "file.write",
    sessionId,
    subjectId: path,
    subjectType: "file",
    threadId,
    ts,
  }));
}

export function buildCommandActivity({
  command,
  cwd,
  durationMs,
  exitCode,
  itemId,
  itemStatus,
  sessionId,
  threadId,
  ts,
}) {
  return {
    detail: {
      command,
      cwd,
      durationMs,
      exitCode,
      itemId,
      itemStatus,
    },
    kind: "command.execute",
    sessionId,
    subjectId: itemId,
    subjectType: "command",
    threadId,
    ts,
  };
}

export function buildFileReadActivities({
  text,
  itemId,
  sessionId,
  threadId,
  ts,
}) {
  return extractAbsolutePathsFromText(text).map((path) => ({
    detail: {
      itemId,
      path,
      source: "item/completed",
    },
    kind: "file.read",
    sessionId,
    subjectId: path,
    subjectType: "file",
    threadId,
    ts,
  }));
}

export const TOOL_ITEM_TYPES = new Set([
  "mcpToolCall",
  "dynamicToolCall",
  "collabToolCall",
  "webSearch",
  "imageView",
]);

export const TRACKED_RUNTIME_METHODS = new Set([
  "thread/name/updated",
  "turn/started",
  "turn/completed",
  "turn/plan/updated",
  "turn/diff/updated",
  "tool/requestUserInput",
  "item/completed",
]);

export { firstString, asRecord };
