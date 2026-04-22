import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DesktopBugAttachment,
  DesktopBugReportResult,
  DesktopBugReportingStatus,
  DesktopBugSeverity,
} from "../../../shared/contracts/bug-reporting.js";
import {
  EMPTY_DRAFT,
  INITIAL_STATE,
  appendAttachments,
  buildDraftPayload,
  canSubmit,
  inferAttachmentFromPath,
  removeAttachment,
  sanitizeReportErrorMessage,
  type ReportBugDraft,
  type ReportBugPhase,
} from "./report-bug-state.js";
import { getReportBugCorrelationSnapshot, recordReportBugAction } from "./report-bug-correlation.js";

export interface ReportBugController {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
  draft: ReportBugDraft;
  phase: ReportBugPhase;
  errorMessage: string | null;
  result: DesktopBugReportResult | null;
  status: DesktopBugReportingStatus | null;
  canSubmit: boolean;
  attachmentPickerPending: boolean;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setExpectedBehavior: (value: string) => void;
  setReproductionSteps: (value: string) => void;
  setSeverity: (value: DesktopBugSeverity | "") => void;
  addAttachments: () => Promise<void>;
  removeAttachmentAt: (path: string) => void;
  submit: () => Promise<void>;
  resetAfterSuccess: () => void;
}

export function useReportBugController(): ReportBugController {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportBugDraft>(EMPTY_DRAFT);
  const [phase, setPhase] = useState<ReportBugPhase>(INITIAL_STATE.phase);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DesktopBugReportResult | null>(null);
  const [status, setStatus] = useState<DesktopBugReportingStatus | null>(null);
  const [attachmentPickerPending, setAttachmentPickerPending] = useState(false);
  const statusRequestRef = useRef(0);

  const resetState = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setPhase("idle");
    setErrorMessage(null);
    setResult(null);
  }, []);

  const openModal = useCallback(() => {
    resetState();
    recordReportBugAction("action", "started", "bug report modal", "opened");
    setOpen(true);
    const requestId = ++statusRequestRef.current;
    const bridge = window.sense1Desktop;
    if (!bridge?.reports?.getStatus) {
      setStatus(null);
      return;
    }
    void bridge.reports
      .getStatus()
      .then((nextStatus) => {
        if (requestId !== statusRequestRef.current) {
          return;
        }
        setStatus(nextStatus);
      })
      .catch(() => {
        if (requestId !== statusRequestRef.current) {
          return;
        }
        setStatus(null);
      });
  }, [resetState]);

  const closeModal = useCallback(() => {
    if (phase === "submitting") {
      return;
    }
    setOpen(false);
    statusRequestRef.current += 1;
  }, [phase]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closeModal]);

  const setTitle = useCallback((value: string) => {
    setDraft((current) => ({ ...current, title: value }));
  }, []);
  const setDescription = useCallback((value: string) => {
    setDraft((current) => ({ ...current, description: value }));
  }, []);
  const setExpectedBehavior = useCallback((value: string) => {
    setDraft((current) => ({ ...current, expectedBehavior: value }));
  }, []);
  const setReproductionSteps = useCallback((value: string) => {
    setDraft((current) => ({ ...current, reproductionSteps: value }));
  }, []);
  const setSeverity = useCallback((value: DesktopBugSeverity | "") => {
    setDraft((current) => ({ ...current, severity: value }));
  }, []);

  const addAttachments = useCallback(async () => {
    const bridge = window.sense1Desktop;
    if (!bridge?.workspace?.pickFiles) {
      return;
    }
    setAttachmentPickerPending(true);
    try {
      const pickResult = await bridge.workspace.pickFiles();
      if (pickResult.canceled || pickResult.paths.length === 0) {
        return;
      }
      const additions: DesktopBugAttachment[] = pickResult.paths.map((path) =>
        inferAttachmentFromPath(path),
      );
      setDraft((current) => ({
        ...current,
        attachments: appendAttachments(current.attachments, additions),
      }));
    } catch {
      // Ignore picker errors; user can retry.
    } finally {
      setAttachmentPickerPending(false);
    }
  }, []);

  const removeAttachmentAt = useCallback((path: string) => {
    setDraft((current) => ({
      ...current,
      attachments: removeAttachment(current.attachments, path),
    }));
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit(draft)) {
      return;
    }
    const bridge = window.sense1Desktop;
    if (!bridge?.reports?.submit) {
      setErrorMessage("Bug reporting is not available in this build.");
      setPhase("error");
      return;
    }
    setPhase("submitting");
    setErrorMessage(null);
    try {
      recordReportBugAction("action", "started", "bug report submit");
      const payload = buildDraftPayload(draft, getReportBugCorrelationSnapshot());
      const nextResult = await bridge.reports.submit(payload);
      recordReportBugAction("action", "succeeded", "bug report submit", nextResult.sentryEventId);
      setResult(nextResult);
      setPhase("success");
    } catch (error) {
      const message = sanitizeReportErrorMessage(
        error instanceof Error ? error.message : "Could not submit this bug report.",
      );
      recordReportBugAction("action", "failed", "bug report submit", message);
      setErrorMessage(message.length > 0 ? message : "Could not submit this bug report.");
      setPhase("error");
    }
  }, [draft]);

  const resetAfterSuccess = useCallback(() => {
    resetState();
    setOpen(false);
  }, [resetState]);

  return {
    open,
    openModal,
    closeModal,
    draft,
    phase,
    errorMessage,
    result,
    status,
    canSubmit: canSubmit(draft),
    attachmentPickerPending,
    setTitle,
    setDescription,
    setExpectedBehavior,
    setReproductionSteps,
    setSeverity,
    addAttachments,
    removeAttachmentAt,
    submit,
    resetAfterSuccess,
  };
}
