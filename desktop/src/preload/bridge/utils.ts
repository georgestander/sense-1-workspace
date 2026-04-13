import type { DesktopRuntimeEvent } from "../../shared/contracts/index";

export function shouldRefreshSessionSnapshot(event: DesktopRuntimeEvent | null | undefined): boolean {
  if (!event) {
    return false;
  }

  return (
    event.kind === "accountChanged" ||
    event.kind === "approvalRequested" ||
    event.kind === "approvalResolved" ||
    event.kind === "permissionRequired"
  );
}
