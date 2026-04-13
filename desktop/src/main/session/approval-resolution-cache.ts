import type { DesktopApprovalEvent, DesktopApprovalResponseRequest } from "../contracts.ts";

function cloneRunContext(runContext: DesktopApprovalEvent["runContext"]): DesktopApprovalEvent["runContext"] {
  if (!runContext) {
    return null;
  }

  return {
    actor: { ...runContext.actor },
    scope: { ...runContext.scope },
    grants: runContext.grants.map((grant) => ({ ...grant })),
    policy: { ...runContext.policy },
  };
}

function cloneApproval(
  approval: DesktopApprovalEvent | null | undefined,
): DesktopApprovalEvent | null {
  if (!approval) {
    return null;
  }

  return {
    ...approval,
    command: [...approval.command],
    runContext: cloneRunContext(approval.runContext),
    ...("permissions" in approval
      ? {
          permissions: approval.permissions
            ? {
                fileSystem: approval.permissions.fileSystem
                  ? {
                      read: approval.permissions.fileSystem.read
                        ? [...approval.permissions.fileSystem.read]
                        : approval.permissions.fileSystem.read ?? null,
                      write: approval.permissions.fileSystem.write
                        ? [...approval.permissions.fileSystem.write]
                        : approval.permissions.fileSystem.write ?? null,
                    }
                  : approval.permissions.fileSystem ?? null,
                network: approval.permissions.network
                  ? { ...approval.permissions.network }
                  : approval.permissions.network ?? null,
              }
            : approval.permissions ?? null,
        }
      : {}),
  };
}

export class DesktopApprovalResolutionCache {
  readonly #responsesById = new Map<
    number,
    {
      approval: DesktopApprovalEvent;
      decision: DesktopApprovalResponseRequest["decision"];
    }
  >();
  readonly #consumedResponseIds = new Set<number>();

  rememberResponse(
    approval: DesktopApprovalEvent | null | undefined,
    decision: DesktopApprovalResponseRequest["decision"],
  ): void {
    const snapshot = cloneApproval(approval);
    if (!snapshot) {
      return;
    }

    this.#consumedResponseIds.delete(snapshot.id);
    this.#responsesById.set(snapshot.id, {
      approval: snapshot,
      decision,
    });
  }

  consume(
    requestId: number,
    fallbackApproval: DesktopApprovalEvent | null = null,
  ): {
    alreadyConsumed: boolean;
    approval: DesktopApprovalEvent | null;
    consumedResponse: boolean;
    decision: DesktopApprovalResponseRequest["decision"] | null;
  } {
    const response = this.#responsesById.get(requestId) ?? null;
    this.#responsesById.delete(requestId);
    if (response) {
      this.#consumedResponseIds.add(requestId);
    }

    return {
      alreadyConsumed: !response && this.#consumedResponseIds.has(requestId),
      approval: response?.approval ?? cloneApproval(fallbackApproval),
      consumedResponse: Boolean(response),
      decision: response?.decision ?? null,
    };
  }

  forget(requestId: number): void {
    this.#responsesById.delete(requestId);
    this.#consumedResponseIds.delete(requestId);
  }

  clear(): void {
    this.#responsesById.clear();
    this.#consumedResponseIds.clear();
  }
}
