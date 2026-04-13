import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "../../lib/cn";

export type RightRailSectionProps = {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
};

export function RightRailSection({
  title,
  open,
  onToggle,
  badge,
  children,
  bodyClassName,
}: RightRailSectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface-soft">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-surface-strong focus-visible:ring-[3px] focus-visible:ring-accent/30"
        onClick={onToggle}
        type="button"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">{title}</span>
        <span className="flex items-center gap-2">
          {badge}
          <ChevronDown className={cn("size-4 text-muted transition-transform", open ? "rotate-180" : "")} />
        </span>
      </button>
      {open ? <div className={cn("px-3 py-3", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

export type RightRailSectionSharedProps = {
  isRightRailSectionOpen: (section: string) => boolean;
  toggleRightRailSection: (section: string) => void;
};

export function resolveWorkspaceFilePath(filePath: string, workspaceRoot: string | null | undefined): string {
  if (!filePath || filePath.startsWith("/") || /^[a-zA-Z]:\\/.test(filePath) || !workspaceRoot?.trim()) {
    return filePath;
  }

  const normalizedRoot = workspaceRoot.replace(/[\\/]+$/, "");
  const normalizedPath = filePath.replace(/^[.][\\/]/, "").replace(/^[\\/]+/, "");
  return `${normalizedRoot}/${normalizedPath}`;
}
