export function getThreadListStatus(thread: {
  state?: string | null;
  threadInputState?: { hasUnseenCompletion?: boolean | null } | null;
}) {
  if (thread?.state === "running") {
    return "running";
  }

  if (thread?.threadInputState?.hasUnseenCompletion) {
    return "completed";
  }

  return "idle";
}
