import type { DesktopUpdateState } from "../main/contracts";

export declare function shouldShowHeaderUpdateAction(
  updateState: DesktopUpdateState | null | undefined,
): boolean;

export declare function resolveSettingsUpdateSummary(
  updateState: DesktopUpdateState | null | undefined,
): {
  title: string;
  detail: string;
  isError: boolean;
};
