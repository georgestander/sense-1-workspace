import type { DesktopThreadChangeGroup, DesktopThreadSnapshot } from "../../../main/contracts";

export function shouldShowReviewArtifacts({
  effectiveThreadBusy,
  reviewSummary,
  rightRailChangeGroups,
  threadInteractionState,
}: {
  effectiveThreadBusy: boolean;
  reviewSummary: DesktopThreadSnapshot["reviewSummary"];
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  threadInteractionState: string | null;
}): boolean {
  if (threadInteractionState === "review") {
    return true;
  }

  return Boolean(
    reviewSummary?.summary?.trim()
      || (reviewSummary?.changedArtifacts?.length ?? 0) > 0
      || (!effectiveThreadBusy && rightRailChangeGroups.length > 0),
  );
}
