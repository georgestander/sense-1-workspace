function firstString(...values: Array<unknown>): string | null {
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export class RuntimeFileChangeTracker {
  readonly #runtimeSignalsByThreadId = new Set<string>();

  observe(message: unknown): void {
    const record = asRecord(message);
    const method = firstString(record?.method);
    const params = asRecord(record?.params);
    const threadId = firstString(params?.threadId);
    if (!method || !threadId) {
      return;
    }

    if (method === "turn/started") {
      this.#runtimeSignalsByThreadId.delete(threadId);
      return;
    }

    if (method === "turn/diff/updated") {
      this.#runtimeSignalsByThreadId.add(threadId);
      return;
    }

    if (method !== "item/completed") {
      return;
    }

    const item = asRecord(params?.item);
    if (firstString(item?.type) === "fileChange") {
      this.#runtimeSignalsByThreadId.add(threadId);
    }
  }

  consumeFallbackRequirement(threadId: string | null | undefined): boolean {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return false;
    }

    const needsFallback = !this.#runtimeSignalsByThreadId.has(resolvedThreadId);
    this.#runtimeSignalsByThreadId.delete(resolvedThreadId);
    return needsFallback;
  }

  clear(threadId: string | null | undefined): void {
    const resolvedThreadId = firstString(threadId);
    if (!resolvedThreadId) {
      return;
    }

    this.#runtimeSignalsByThreadId.delete(resolvedThreadId);
  }

  clearAll(): void {
    this.#runtimeSignalsByThreadId.clear();
  }
}
