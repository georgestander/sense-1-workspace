export type DesktopActiveView = "home" | "plugins" | "automations";

export function shouldShowHomeRightRail(activeView: DesktopActiveView, showRightRail: boolean): boolean {
  return activeView === "home" && showRightRail;
}
