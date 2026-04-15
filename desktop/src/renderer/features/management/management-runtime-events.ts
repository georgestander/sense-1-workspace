import type { DesktopRuntimeEvent } from "../../../main/contracts";

export function shouldReloadManagementOverviewForRuntimeEvent(
  event: DesktopRuntimeEvent | null | undefined,
): boolean {
  return event?.kind === "managementInventoryChanged";
}
