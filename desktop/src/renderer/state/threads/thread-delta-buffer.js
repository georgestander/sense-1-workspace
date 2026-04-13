function firstString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function resolveThreadId(delta) {
  if (!delta || typeof delta !== "object" || !("threadId" in delta)) {
    return null;
  }

  return firstString(delta.threadId);
}

export function createThreadDeltaBuffer() {
  let knownThreadIds = new Set();
  let pendingByThreadId = {};

  return {
    clear() {
      knownThreadIds = new Set();
      pendingByThreadId = {};
    },
    rememberKnownThreadIds(threadIds) {
      const nextKnownThreadIds = new Set(knownThreadIds);
      for (const threadId of threadIds) {
        const resolvedThreadId = firstString(threadId);
        if (resolvedThreadId) {
          nextKnownThreadIds.add(resolvedThreadId);
        }
      }
      knownThreadIds = nextKnownThreadIds;
    },
    setKnownThreadIds(threadIds) {
      const nextKnownThreadIds = new Set();
      for (const threadId of threadIds) {
        const resolvedThreadId = firstString(threadId);
        if (resolvedThreadId) {
          nextKnownThreadIds.add(resolvedThreadId);
        }
      }
      knownThreadIds = nextKnownThreadIds;
    },
    hasKnownThread(threadId) {
      const resolvedThreadId = firstString(threadId);
      return resolvedThreadId ? knownThreadIds.has(resolvedThreadId) : false;
    },
    queue(delta) {
      const threadId = resolveThreadId(delta);
      if (!threadId) {
        return;
      }

      const pending = pendingByThreadId[threadId] ?? [];
      pendingByThreadId = {
        ...pendingByThreadId,
        [threadId]: [...pending, delta],
      };
    },
    drain(threadId) {
      const resolvedThreadId = firstString(threadId);
      if (!resolvedThreadId) {
        return [];
      }

      const pending = pendingByThreadId[resolvedThreadId];
      if (!pending?.length) {
        return [];
      }

      const nextPending = { ...pendingByThreadId };
      delete nextPending[resolvedThreadId];
      pendingByThreadId = nextPending;
      return pending;
    },
    dropThread(threadId) {
      const resolvedThreadId = firstString(threadId);
      if (!resolvedThreadId) {
        return;
      }

      if (knownThreadIds.has(resolvedThreadId)) {
        const nextKnownThreadIds = new Set(knownThreadIds);
        nextKnownThreadIds.delete(resolvedThreadId);
        knownThreadIds = nextKnownThreadIds;
      }

      if (pendingByThreadId[resolvedThreadId]) {
        const nextPending = { ...pendingByThreadId };
        delete nextPending[resolvedThreadId];
        pendingByThreadId = nextPending;
      }
    },
  };
}
