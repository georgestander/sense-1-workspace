import type { DesktopOperatingMode } from "./workspace.js";

export interface DesktopRunActor {
  readonly id: string;
  readonly kind: "user" | "agent" | "service";
  readonly displayName: string;
  readonly email: string | null;
  readonly homeScopeId: string;
  readonly role?: string;
  readonly capabilities?: string[];
  readonly trustLevel: "low" | "medium" | "high";
}

export interface DesktopRunScope {
  readonly id: string;
  readonly kind: "private" | "team";
  readonly displayName: string;
  readonly profileId: string;
  readonly tenantId?: string | null;
  readonly tenantDisplayName?: string | null;
}

export interface DesktopRunGrant {
  readonly kind: "workspaceRoot";
  readonly rootPath: string;
  readonly access: "workspaceWrite";
}

export interface DesktopRunPolicy {
  readonly executionPolicyMode: "defaultProfilePrivateScope" | DesktopOperatingMode;
  readonly approvalPolicy: "onRequest" | "unlessTrusted" | "never";
  readonly sandboxPolicy: "workspaceWrite" | "readOnly";
  readonly trustLevel: "low" | "medium" | "high";
}

export interface DesktopRunContext {
  readonly actor: DesktopRunActor;
  readonly scope: DesktopRunScope;
  readonly grants: DesktopRunGrant[];
  readonly policy: DesktopRunPolicy;
}

export interface DesktopAuditAuthority {
  readonly scopeId: string;
  readonly executionPolicyMode: "defaultProfilePrivateScope" | DesktopOperatingMode;
  readonly approvalPolicy: "onRequest" | "unlessTrusted" | "never";
  readonly sandboxPolicy: "workspaceWrite" | "readOnly";
  readonly trustLevel: "low" | "medium" | "high";
  readonly grantRoots: string[];
}

export interface DesktopAuditEvent {
  readonly id: string;
  readonly eventType:
    | "run.started"
    | "run.policy.allowed"
    | "run.policy.blocked"
    | "run.policy.escalated"
    | "run.approval.requested"
    | "run.approval.resolved"
    | "settings.updated"
    | "run.thread.content.changed"
    | "run.thread.list.changed";
  readonly happenedAt: string;
  readonly threadId: string | null;
  readonly turnId: string | null;
  readonly actor: DesktopRunActor;
  readonly scope: DesktopRunScope;
  readonly authority: DesktopAuditAuthority;
  readonly details: Record<string, unknown>;
}
