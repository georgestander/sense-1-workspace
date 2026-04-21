import { useCallback, useEffect, useState } from "react";

import type { DesktopCrashReportSuggestion } from "../../../shared/contracts/bug-reporting.js";
import type { DesktopRuntimeEvent } from "../../../shared/contracts/events.js";

export interface CrashRecoveryPromptState {
  readonly suggestion: DesktopCrashReportSuggestion | null;
  readonly dismiss: () => Promise<void>;
  readonly clear: () => void;
}

function suggestionFromEvent(event: DesktopRuntimeEvent): DesktopCrashReportSuggestion | null {
  if (event.kind !== "crashReportSuggested") {
    return null;
  }
  return {
    reason: event.reason,
    detail: event.detail,
    setupCode: event.setupCode,
    restartCount: event.restartCount,
    occurredAt: event.occurredAt,
  };
}

export function useCrashRecoveryPrompt(): CrashRecoveryPromptState {
  const [suggestion, setSuggestion] = useState<DesktopCrashReportSuggestion | null>(null);

  useEffect(() => {
    let isActive = true;
    const bridge = window.sense1Desktop;
    if (!bridge?.session?.get) {
      return;
    }
    void bridge.session
      .get()
      .then((bootstrap) => {
        if (!isActive) {
          return;
        }
        setSuggestion((current) => current ?? bootstrap.crashReportSuggestion ?? null);
      })
      .catch(() => {
        // Keep the current state; a live event will still surface the prompt.
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const bridge = window.sense1Desktop;
    if (!bridge?.session?.onRuntimeEvent) {
      return;
    }
    const unsubscribe = bridge.session.onRuntimeEvent((event: DesktopRuntimeEvent) => {
      const next = suggestionFromEvent(event);
      if (next) {
        setSuggestion(next);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const clear = useCallback(() => {
    setSuggestion(null);
  }, []);

  const dismiss = useCallback(async () => {
    const target = suggestion;
    if (!target) {
      return;
    }
    setSuggestion(null);
    const bridge = window.sense1Desktop;
    if (!bridge?.reports?.acknowledgeCrashReport) {
      return;
    }
    try {
      await bridge.reports.acknowledgeCrashReport({ occurredAt: target.occurredAt });
    } catch {
      // Acknowledgement failures are non-fatal — the prompt stays dismissed in this
      // renderer; bootstrap re-hydration on next launch will re-surface it if needed.
    }
  }, [suggestion]);

  return { suggestion, dismiss, clear };
}
