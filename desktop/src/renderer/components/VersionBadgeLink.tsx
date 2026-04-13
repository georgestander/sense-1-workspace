import { cn } from "../lib/cn";

import type { RuntimeStatus } from "../use-desktop-session-state.js";

const CHANGELOG_URL = "https://github.com/georgestander/sense-1-workspace/releases";

type VersionBadgeLinkProps = {
  runtimeStatus: RuntimeStatus;
  fallbackLabel: string;
  className?: string;
};

export function VersionBadgeLink({
  runtimeStatus,
  fallbackLabel,
  className,
}: VersionBadgeLinkProps) {
  const label = runtimeStatus
    ? `v${runtimeStatus.appVersion} on ${runtimeStatus.platform}`
    : fallbackLabel;

  return (
    <a
      className={cn(
        "rounded-full bg-surface-soft px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-soft/80 hover:text-ink",
        className,
      )}
      href={CHANGELOG_URL}
      rel="noreferrer"
      target="_blank"
      title="Open releases on GitHub"
    >
      {label}
    </a>
  );
}
