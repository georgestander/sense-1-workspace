import { X } from "lucide-react";

import { Button } from "../ui/button";
import type { DesktopCrashReportSuggestion } from "../../../shared/contracts/bug-reporting.js";

const REASON_MESSAGES: Record<DesktopCrashReportSuggestion["reason"], string> = {
  "runtime-crashed": "The runtime crashed and restarted cleanly.",
  "runtime-errored": "The runtime hit an error and recovered.",
  "bootstrap-blocked": "Startup was blocked earlier but is working again.",
  "renderer-gone": "The app window recovered from a crash.",
};

export interface CrashRecoveryPromptProps {
  suggestion: DesktopCrashReportSuggestion | null;
  onReport: () => void;
  onDismiss: () => void;
}

export function CrashRecoveryPrompt({
  suggestion,
  onReport,
  onDismiss,
}: CrashRecoveryPromptProps) {
  if (!suggestion) {
    return null;
  }

  const message = REASON_MESSAGES[suggestion.reason];

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 items-center gap-3 border-b border-line bg-warning-faint px-4 py-2 text-[0.8125rem] leading-[1.5] text-ink"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <span className="font-medium">Sense-1 recovered.</span>{" "}
        <span className="text-ink-muted">{message} Share what happened so we can look into it.</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button onClick={onReport} size="sm" variant="secondary">
          Report bug
        </Button>
        <Button
          aria-label="Dismiss recovery prompt"
          onClick={onDismiss}
          size="icon-sm"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
