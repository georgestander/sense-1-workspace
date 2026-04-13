import { normalizeDesktopApprovalEvent } from "../runtime/runtime-events.ts";
import type {
  DesktopApprovalEvent,
  DesktopApprovalResponseRequest,
  DesktopAuditEvent,
  DesktopInteractionState,
  DesktopRunContext,
  DesktopRuntimeEvent,
  DesktopTaskRunResult,
} from "../contracts.ts";
import { DesktopApprovalResolutionCache } from "./approval-resolution-cache.ts";

type RecordAuditEventInput = {
  details?: Record<string, unknown>;
  eventType: DesktopAuditEvent["eventType"];
  runContext: DesktopRunContext | null;
  threadId?: string | null;
  turnId?: string | null;
};

type ApprovalEventRecord = {
  approval: DesktopApprovalEvent | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  decision?: string | null;
  requestId: number;
  verb: string;
};

type SyntheticApprovalState = {
  onAccept: () => Promise<DesktopTaskRunResult>;
};

type DesktopApprovalServiceOptions = {
  appendApprovalEvent: (input: ApprovalEventRecord) => Promise<void>;
  loadPersistedApprovals: () => Promise<unknown[]>;
  persistPendingApprovals: (approvals: DesktopApprovalEvent[]) => Promise<void>;
  queueApprovalEvent: (input: ApprovalEventRecord) => void;
  recordAuditEvent: (input: RecordAuditEventInput) => void;
  rememberThreadInteractionState: (
    threadId: string,
    interactionState: DesktopInteractionState,
  ) => Promise<unknown>;
  respondRuntimeApproval: (
    requestId: number,
    approval: DesktopApprovalEvent | null,
    decision: DesktopApprovalResponseRequest["decision"],
  ) => void;
};

function interactionStateForPendingApproval(_approval: DesktopApprovalEvent): DesktopInteractionState {
  return "executing";
}

function isAcceptedApprovalDecision(
  decision: DesktopApprovalResponseRequest["decision"] | null,
): boolean {
  return decision === "accept" || decision === "acceptForSession";
}

function approvalEventVerbForDecision(
  decision: DesktopApprovalResponseRequest["decision"] | null,
): "approval.granted" | "approval.declined" | "approval.trusted" {
  if (decision === "acceptForSession") {
    return "approval.trusted";
  }

  return decision === "accept" ? "approval.granted" : "approval.declined";
}

function approvalEventStatusForDecision(
  decision: DesktopApprovalResponseRequest["decision"] | null,
): "accepted" | "declined" | "trusted" {
  if (decision === "acceptForSession") {
    return "trusted";
  }

  return decision === "accept" ? "accepted" : "declined";
}

function interactionStateForResolvedApproval(
  decision: DesktopApprovalResponseRequest["decision"],
): DesktopInteractionState {
  return isAcceptedApprovalDecision(decision) ? "executing" : "review";
}

export class DesktopApprovalService {
  readonly #appendApprovalEvent: (input: ApprovalEventRecord) => Promise<void>;
  readonly #loadPersistedApprovals: () => Promise<unknown[]>;
  readonly #persistPendingApprovals: (approvals: DesktopApprovalEvent[]) => Promise<void>;
  readonly #queueApprovalEvent: (input: ApprovalEventRecord) => void;
  readonly #recordAuditEvent: (input: RecordAuditEventInput) => void;
  readonly #rememberThreadInteractionState: (
    threadId: string,
    interactionState: DesktopInteractionState,
  ) => Promise<unknown>;
  readonly #respondRuntimeApproval: (
    requestId: number,
    approval: DesktopApprovalEvent | null,
    decision: DesktopApprovalResponseRequest["decision"],
  ) => void;
  readonly #pendingApprovalsById = new Map<number, DesktopApprovalEvent>();
  readonly #syntheticApprovalsById = new Map<number, SyntheticApprovalState>();
  readonly #approvalResolutionCache = new DesktopApprovalResolutionCache();
  readonly #locallyResolvedRuntimeApprovalIds = new Set<number>();
  #approvalRestoreReady: Promise<void> = Promise.resolve();
  #nextSyntheticApprovalId = -1;

  constructor({
    appendApprovalEvent,
    loadPersistedApprovals,
    persistPendingApprovals,
    queueApprovalEvent,
    recordAuditEvent,
    rememberThreadInteractionState,
    respondRuntimeApproval,
  }: DesktopApprovalServiceOptions) {
    this.#appendApprovalEvent = appendApprovalEvent;
    this.#loadPersistedApprovals = loadPersistedApprovals;
    this.#persistPendingApprovals = persistPendingApprovals;
    this.#queueApprovalEvent = queueApprovalEvent;
    this.#recordAuditEvent = recordAuditEvent;
    this.#rememberThreadInteractionState = rememberThreadInteractionState;
    this.#respondRuntimeApproval = respondRuntimeApproval;
    this.#approvalRestoreReady = this.restore();
  }

  restore(): Promise<void> {
    this.#approvalRestoreReady = this.#restorePersistedApprovals();
    return this.#approvalRestoreReady;
  }

  waitUntilReady(): Promise<void> {
    return this.#approvalRestoreReady;
  }

  waitUntilRestored(): Promise<void> {
    return this.#approvalRestoreReady;
  }

  listPendingApprovals(): DesktopApprovalEvent[] {
    return Array.from(this.#pendingApprovalsById.values());
  }

  allocateSyntheticApprovalId(): number {
    const approvalId = this.#nextSyntheticApprovalId;
    this.#nextSyntheticApprovalId -= 1;
    return approvalId;
  }

  rememberSyntheticApproval(
    approval: DesktopApprovalEvent,
    syntheticApproval: SyntheticApprovalState,
  ): void {
    this.#syntheticApprovalsById.set(approval.id, syntheticApproval);
    this.#rememberPendingApproval(approval, { persist: false });
  }

  handleRuntimeEvent(
    event: DesktopRuntimeEvent,
    fallbackRunContext: DesktopRunContext | null,
  ): boolean {
    if (event.kind === "approvalRequested") {
      const approval = normalizeDesktopApprovalEvent(event.approval, fallbackRunContext);
      if (approval) {
        this.#rememberPendingApproval(approval);
      }
      return true;
    }

    if (event.kind !== "approvalResolved") {
      return false;
    }

    const pendingApproval = this.#pendingApprovalsById.get(event.requestId) ?? null;
    const { alreadyConsumed, approval, decision } = this.#approvalResolutionCache.consume(
      event.requestId,
      pendingApproval,
    );
    const handledLocally = this.#locallyResolvedRuntimeApprovalIds.delete(event.requestId);
    if (alreadyConsumed && !pendingApproval && !handledLocally) {
      return true;
    }

    this.#pendingApprovalsById.delete(event.requestId);
    void this.#persistApprovals();
    if (handledLocally) {
      return true;
    }

    this.#recordAuditEvent({
      eventType: "run.approval.resolved",
      runContext: approval?.runContext ?? null,
      threadId: approval?.threadId ?? null,
      details: {
        approvalKind: approval?.kind ?? null,
        decision,
        grantRoot: approval?.grantRoot ?? null,
        permissions: approval?.permissions ?? null,
        requestId: event.requestId,
        reason: approval?.reason ?? null,
      },
    });
    this.#queueApprovalEvent({
      afterState: { status: approvalEventStatusForDecision(decision) },
      approval,
      beforeState: { status: "requested" },
      decision,
      requestId: event.requestId,
      verb: approvalEventVerbForDecision(decision),
    });
    return true;
  }

  async respondToApproval(
    { decision, requestId }: DesktopApprovalResponseRequest,
  ): Promise<DesktopTaskRunResult | null> {
    const approval = this.#pendingApprovalsById.get(requestId) ?? null;
    const syntheticApproval = this.#syntheticApprovalsById.get(requestId) ?? null;
    if (approval && syntheticApproval) {
      this.#syntheticApprovalsById.delete(requestId);
      if (decision === "decline") {
        await this.#resolveLocalApproval(approval, "decline", { persist: false });
        return null;
      }

      await this.#resolveLocalApproval(approval, "accept", { persist: false });
      return await syntheticApproval.onAccept();
    }

    this.#approvalResolutionCache.rememberResponse(approval, decision);
    try {
      this.#respondRuntimeApproval(requestId, approval, decision);

      if (approval) {
        this.#recordAuditEvent({
          eventType: "run.approval.resolved",
          runContext: approval.runContext,
          threadId: approval.threadId,
          details: {
            approvalKind: approval.kind,
            decision,
            grantRoot: approval.grantRoot,
            permissions: approval.permissions ?? null,
            requestId,
            reason: approval.reason,
          },
        });
        await this.#rememberThreadInteractionState(
          approval.threadId,
          interactionStateForResolvedApproval(decision),
        );
        this.#locallyResolvedRuntimeApprovalIds.add(requestId);
        this.#queueApprovalEvent({
          afterState: { status: approvalEventStatusForDecision(decision) },
          approval,
          beforeState: { status: "requested" },
          decision,
          requestId,
          verb: approvalEventVerbForDecision(decision),
        });
      }

      this.#pendingApprovalsById.delete(requestId);
      await this.#persistApprovals();
      return null;
    } catch (error) {
      this.#locallyResolvedRuntimeApprovalIds.delete(requestId);
      this.#approvalResolutionCache.forget(requestId);
      throw error;
    }
  }

  resetForProfileChange(): void {
    this.#pendingApprovalsById.clear();
    this.#syntheticApprovalsById.clear();
    this.#approvalResolutionCache.clear();
    this.#locallyResolvedRuntimeApprovalIds.clear();
    this.#nextSyntheticApprovalId = -1;
    this.#approvalRestoreReady = this.#restorePersistedApprovals();
  }

  async #restorePersistedApprovals(): Promise<void> {
    try {
      const saved = await this.#loadPersistedApprovals();
      for (const raw of saved) {
        const approval = raw as DesktopApprovalEvent;
        if (typeof approval?.id === "number" && typeof approval?.threadId === "string") {
          this.#pendingApprovalsById.set(approval.id, approval);
        }
      }
    } catch {
      // Non-fatal — approvals will be re-delivered by the engine if still pending.
    }
  }

  async #persistApprovals(): Promise<void> {
    try {
      await this.#persistPendingApprovals(Array.from(this.#pendingApprovalsById.values()));
    } catch {
      // Non-fatal — best-effort durability.
    }
  }

  #rememberPendingApproval(
    approval: DesktopApprovalEvent,
    options: { persist?: boolean } = {},
  ): void {
    const shouldPersist = options.persist !== false;
    this.#approvalResolutionCache.forget(approval.id);
    this.#pendingApprovalsById.set(approval.id, approval);
    this.#recordAuditEvent({
      eventType: "run.approval.requested",
      runContext: approval.runContext,
      threadId: approval.threadId,
      details: {
        approvalKind: approval.kind,
        grantRoot: approval.grantRoot,
        permissions: approval.permissions ?? null,
        requestId: approval.id,
        reason: approval.reason,
      },
    });
    if (shouldPersist) {
      void this.#persistApprovals();
    }
    void this.#rememberThreadInteractionState(
      approval.threadId,
      interactionStateForPendingApproval(approval),
    );
    this.#queueApprovalEvent({
      afterState: { status: "requested" },
      approval,
      beforeState: null,
      requestId: approval.id,
      verb: "approval.requested",
    });
  }

  async #resolveLocalApproval(
    approval: DesktopApprovalEvent,
    decision: DesktopApprovalResponseRequest["decision"],
    options: { persist?: boolean } = {},
  ): Promise<void> {
    const shouldPersist = options.persist !== false;
    this.#recordAuditEvent({
      eventType: "run.approval.resolved",
      runContext: approval.runContext,
      threadId: approval.threadId,
      details: {
        approvalKind: approval.kind,
        decision,
        grantRoot: approval.grantRoot,
        permissions: approval.permissions ?? null,
        requestId: approval.id,
        reason: approval.reason,
      },
    });
    this.#pendingApprovalsById.delete(approval.id);
    if (shouldPersist) {
      await this.#persistApprovals();
    }
    await this.#rememberThreadInteractionState(
      approval.threadId,
      interactionStateForResolvedApproval(decision),
    );
    await this.#appendApprovalEvent({
      afterState: { status: approvalEventStatusForDecision(decision) },
      approval,
      beforeState: { status: "requested" },
      decision,
      requestId: approval.id,
      verb: approvalEventVerbForDecision(decision),
    });
  }
}
