export type WorkspaceLifecycleState = {
  readonly status: "active" | "archived";
  readonly archivedAt: string | null;
};

export function resolveWorkspaceLifecycleState(metadata: unknown): WorkspaceLifecycleState;
export function setWorkspaceLifecycleState(
  metadata: Record<string, unknown> | null | undefined,
  status: string,
  archivedAt?: string | null,
): Record<string, unknown>;
export function isWorkspaceArchived(metadata: unknown): boolean;
export function isSessionArchived(session: { status?: string | null } | null | undefined): boolean;
