import type { DesktopThreadDelta } from "../main/contracts";

export type ThreadDeltaBuffer = {
  clear(): void;
  rememberKnownThreadIds(threadIds: Iterable<string>): void;
  setKnownThreadIds(threadIds: Iterable<string>): void;
  hasKnownThread(threadId: string | null | undefined): boolean;
  queue(delta: DesktopThreadDelta): void;
  drain(threadId: string | null | undefined): DesktopThreadDelta[];
  dropThread(threadId: string | null | undefined): void;
};

export function createThreadDeltaBuffer(): ThreadDeltaBuffer;
