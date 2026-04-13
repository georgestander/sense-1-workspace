import type { DesktopThreadDelta } from "../../../main/contracts";

export const STREAM_DELTA_FLUSH_MS = 16;

export function coalesceThreadDeltas(deltas: DesktopThreadDelta[]): DesktopThreadDelta[] {
  const nextDeltas: DesktopThreadDelta[] = [];
  let pendingEntryDelta: Extract<DesktopThreadDelta, { kind: "entryDelta" }> | null = null;

  function flushPendingEntryDelta() {
    if (!pendingEntryDelta) {
      return;
    }
    nextDeltas.push(pendingEntryDelta);
    pendingEntryDelta = null;
  }

  for (const delta of deltas) {
    if (delta.kind !== "entryDelta") {
      flushPendingEntryDelta();
      nextDeltas.push(delta);
      continue;
    }

    if (
      pendingEntryDelta
      && pendingEntryDelta.threadId === delta.threadId
      && pendingEntryDelta.entryId === delta.entryId
      && pendingEntryDelta.field === delta.field
    ) {
      pendingEntryDelta = {
        kind: "entryDelta",
        threadId: pendingEntryDelta.threadId,
        entryId: pendingEntryDelta.entryId,
        field: pendingEntryDelta.field,
        append: pendingEntryDelta.append + delta.append,
      };
      continue;
    }

    flushPendingEntryDelta();
    pendingEntryDelta = delta;
  }

  flushPendingEntryDelta();
  return nextDeltas;
}
