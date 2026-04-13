type RuntimeNotificationParams = {
  threadId?: unknown;
  itemId?: unknown;
  delta?: unknown;
} & Record<string, unknown>;

export type RuntimeNotification = {
  method?: unknown;
  params?: RuntimeNotificationParams | null;
} & Record<string, unknown>;

function asDeltaNotification(message: RuntimeNotification) {
  if (message.method !== "item/agentMessage/delta") {
    return null;
  }

  const params = message.params;
  if (!params || typeof params !== "object") {
    return null;
  }

  const threadId = typeof params.threadId === "string" ? params.threadId.trim() : "";
  const itemId = typeof params.itemId === "string" ? params.itemId.trim() : "";
  const delta = typeof params.delta === "string" ? params.delta : null;

  if (!threadId || !itemId || delta === null) {
    return null;
  }

  return { threadId, itemId, delta };
}

export function coalesceRuntimeNotifications(messages: RuntimeNotification[]): RuntimeNotification[] {
  const nextMessages: RuntimeNotification[] = [];

  for (const message of messages) {
    const deltaNotification = asDeltaNotification(message);
    const previousMessage = nextMessages.at(-1);
    const previousDeltaNotification = previousMessage ? asDeltaNotification(previousMessage) : null;

    if (
      deltaNotification
      && previousMessage
      && previousDeltaNotification
      && previousDeltaNotification.threadId === deltaNotification.threadId
      && previousDeltaNotification.itemId === deltaNotification.itemId
    ) {
      nextMessages[nextMessages.length - 1] = {
        ...previousMessage,
        params: {
          ...(previousMessage.params ?? {}),
          ...message.params,
          delta: previousDeltaNotification.delta + deltaNotification.delta,
        },
      };
      continue;
    }

    nextMessages.push(message);
  }

  return nextMessages;
}
