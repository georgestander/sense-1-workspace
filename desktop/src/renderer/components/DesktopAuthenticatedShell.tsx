import type { ComponentProps, ReactNode } from "react";
import { House, PanelLeft, PanelRight } from "lucide-react";

import { Button } from "./ui/button";
import { LeftSidebar, type LeftSidebarProps } from "./LeftSidebar";
import { RightRail, type RightRailProps } from "./RightRail";
import { SettingsModal, type SettingsModalProps } from "./SettingsModal";
import { ReportBugModal } from "./bug-report/ReportBugModal";
import { VersionBadgeLink } from "./VersionBadgeLink";
import type { ReportBugController } from "../features/bug-report/use-report-bug-controller";

export interface DesktopAuthenticatedShellProps {
  showInstallUpdateAction: boolean;
  onInstallReadyUpdate: () => void;
  leftRailOpen: boolean;
  onToggleLeftRail: () => void;
  onResetToStartSurface: () => void;
  showRightRail: boolean;
  rightRailOpen: boolean;
  onToggleRightRail: () => void;
  runtimeStatus: ComponentProps<typeof VersionBadgeLink>["runtimeStatus"];
  leftSidebarProps: LeftSidebarProps;
  mainContent: ReactNode;
  rightRailProps: RightRailProps;
  settingsModalProps: SettingsModalProps;
  reportBugController: ReportBugController;
}

export function DesktopAuthenticatedShell({
  showInstallUpdateAction,
  onInstallReadyUpdate,
  leftRailOpen,
  onToggleLeftRail,
  onResetToStartSurface,
  showRightRail,
  rightRailOpen,
  onToggleRightRail,
  runtimeStatus,
  leftSidebarProps,
  mainContent,
  rightRailProps,
  settingsModalProps,
  reportBugController,
}: DesktopAuthenticatedShellProps) {
  return (
    <div className="flex h-screen overflow-hidden flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between bg-surface-glass px-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          {showInstallUpdateAction ? (
            <Button
              className="rounded-full bg-accent px-3 text-on-accent hover:bg-accent/90"
              onClick={onInstallReadyUpdate}
              size="sm"
              type="button"
            >
              Update
            </Button>
          ) : null}
          <Button
            aria-label={leftRailOpen ? "Collapse left sidebar" : "Expand left sidebar"}
            onClick={onToggleLeftRail}
            size="icon-sm"
            variant="ghost"
          >
            <PanelLeft />
          </Button>
          <button
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold tracking-tight transition-colors hover:text-accent"
            onClick={onResetToStartSurface}
            type="button"
          >
            <House className="size-4 text-muted" />
            sense-1
          </button>
        </div>
        <div className="flex items-center gap-2">
          {showRightRail ? (
            <Button
              aria-label={rightRailOpen ? "Collapse right sidebar" : "Expand right sidebar"}
              onClick={onToggleRightRail}
              size="icon-sm"
              variant="ghost"
            >
              <PanelRight />
            </Button>
          ) : null}
          <VersionBadgeLink
            fallbackLabel="Desktop runtime ready"
            runtimeStatus={runtimeStatus}
          />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar {...leftSidebarProps} />

        <main className="min-w-0 flex-1 overflow-hidden bg-canvas">
          <div className="fade-up flex h-full min-h-0 flex-col">{mainContent}</div>
        </main>

        <RightRail {...rightRailProps} />
      </div>

      <SettingsModal {...settingsModalProps} />
      <ReportBugModal controller={reportBugController} />
    </div>
  );
}
