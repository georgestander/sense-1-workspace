export interface SubstrateRuntimeActivity {
  readonly kind: "file.read" | "file.write" | "command.execute";
  readonly sessionId: string;
  readonly threadId: string;
  readonly subjectId: string;
  readonly subjectType: "command" | "file";
  readonly ts: string;
  readonly detail: Record<string, unknown>;
}

export interface SubstrateSessionRecordUpdate {
  readonly sessionId: string;
  readonly threadId: string;
  readonly pathsWritten: string[];
  readonly logCursor: {
    readonly toTs: string;
  };
}

export function writeRuntimeMessageToSubstrate(options: {
  dbPath: string;
  onRuntimeActivity?: (activity: SubstrateRuntimeActivity) => Promise<void> | void;
  onSessionRecordUpdate?: (update: SubstrateSessionRecordUpdate) => Promise<void> | void;
  message: unknown;
  receivedAt?: string | null;
  resolveSessionContextByThreadId: (threadId: string) => Promise<{
    id: string;
    profile_id: string;
    scope_id: string;
    actor_id: string;
    codex_thread_id: string | null;
    workspace_id: string | null;
  } | null>;
}): Promise<{
  status: "written" | "deferred" | "ignored";
  threadId: string | null;
  suggestedThreadTitle?: string;
}>;
