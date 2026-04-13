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

export function buildReadDirectoryRequest(directoryPath, options = {}) {
  const resolvedPath = firstString(directoryPath);
  if (!resolvedPath) {
    throw new Error("A directory path is required to read a directory.");
  }

  return options && typeof options === "object" && !Array.isArray(options)
    ? { ...options, path: resolvedPath }
    : { path: resolvedPath };
}

export function buildReviewStartRequest(threadId, options = {}) {
  const resolvedThreadId = firstString(threadId);
  if (!resolvedThreadId) {
    throw new Error("A thread id is required to start review.");
  }

  const delivery = firstString(options.delivery) || "inline";
  const target =
    options.target && typeof options.target === "object" && !Array.isArray(options.target)
      ? options.target
      : firstString(options.target) || resolvedThreadId;

  return {
    delivery,
    target,
    threadId: resolvedThreadId,
  };
}

export function buildSteerTurnRequest(threadId, input, options = {}) {
  const resolvedThreadId = firstString(threadId);
  const resolvedExpectedTurnId = firstString(options.expectedTurnId);
  if (!resolvedThreadId) {
    throw new Error("A thread id is required to steer a turn.");
  }
  if (!resolvedExpectedTurnId) {
    throw new Error("An expected turn id is required to steer a turn.");
  }

  return {
    expectedTurnId: resolvedExpectedTurnId,
    input,
    threadId: resolvedThreadId,
  };
}
