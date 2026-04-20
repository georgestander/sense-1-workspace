import { useEffect, useRef } from "react";
import { AlertTriangle, Bug, CheckCircle2, Paperclip, X } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/cn";
import type { ReportBugController } from "../../features/bug-report/use-report-bug-controller";
import { resolveReportBugOutcomePresentation } from "../../features/bug-report/report-bug-outcome.js";
import type { DesktopBugSeverity } from "../../../shared/contracts/bug-reporting";

const SEVERITY_OPTIONS: Array<{ value: DesktopBugSeverity; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

type ReportBugModalProps = {
  controller: ReportBugController;
};

export function ReportBugModal({ controller }: ReportBugModalProps) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (controller.open && controller.phase === "idle") {
      titleInputRef.current?.focus();
    }
  }, [controller.open, controller.phase]);

  if (!controller.open) {
    return null;
  }

  const submitting = controller.phase === "submitting";
  const showSuccess = controller.phase === "success";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
        onClick={submitting ? undefined : controller.closeModal}
        role="presentation"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface-high shadow-[var(--shadow-overlay)]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Bug className="size-4 text-accent" />
            <h2 className="font-display text-base font-semibold tracking-tight">Report a bug</h2>
          </div>
          <button
            aria-label="Close"
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
            disabled={submitting}
            onClick={controller.closeModal}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        {showSuccess ? (
          <ReportBugSuccessPanel controller={controller} />
        ) : (
          <ReportBugFormPanel controller={controller} titleInputRef={titleInputRef} />
        )}
      </div>
    </div>
  );
}

type PanelProps = {
  controller: ReportBugController;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
};

function ReportBugFormPanel({ controller, titleInputRef }: PanelProps) {
  const disabled = controller.phase === "submitting";
  const errorBannerVisible = controller.phase === "error" && controller.errorMessage;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <IntakeSummary controller={controller} />

        {errorBannerVisible ? (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-faint px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Couldn&apos;t submit your report</p>
              <p className="text-[13px] leading-snug opacity-90">{controller.errorMessage}</p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <Field label="Title" required hint="A short summary of what went wrong.">
            <input
              className={inputClass}
              disabled={disabled}
              onChange={(event) => controller.setTitle(event.target.value)}
              placeholder="e.g. App crashes when opening settings"
              ref={titleInputRef}
              type="text"
              value={controller.draft.title}
            />
          </Field>

          <Field label="What happened?" required>
            <textarea
              className={cn(inputClass, "min-h-[88px] resize-y")}
              disabled={disabled}
              onChange={(event) => controller.setDescription(event.target.value)}
              placeholder="Describe the bug — what you were doing, what went wrong, anything you noticed."
              value={controller.draft.description}
            />
          </Field>

          <Field label="What did you expect to happen?" hint="Optional.">
            <textarea
              className={cn(inputClass, "min-h-[64px] resize-y")}
              disabled={disabled}
              onChange={(event) => controller.setExpectedBehavior(event.target.value)}
              placeholder="Optional — what should have happened instead?"
              value={controller.draft.expectedBehavior}
            />
          </Field>

          <Field label="Steps to reproduce" hint="Optional but very helpful.">
            <textarea
              className={cn(inputClass, "min-h-[72px] resize-y font-mono text-[13px]")}
              disabled={disabled}
              onChange={(event) => controller.setReproductionSteps(event.target.value)}
              placeholder={"1. Open the app\n2. Click …\n3. Observe …"}
              value={controller.draft.reproductionSteps}
            />
          </Field>

          <Field label="Severity" hint="Optional.">
            <select
              className={cn(inputClass, "h-9 py-0")}
              disabled={disabled}
              onChange={(event) => controller.setSeverity(event.target.value as DesktopBugSeverity | "")}
              value={controller.draft.severity}
            >
              <option value="">Not specified</option>
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <AttachmentsField controller={controller} />
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface-low px-5 py-3">
        <p className="text-[12px] leading-snug text-muted">
          Technical diagnostics (logs, environment, workspace paths) may be attached automatically and redacted before submission.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button disabled={disabled} onClick={controller.closeModal} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={disabled || !controller.canSubmit}
            onClick={() => void controller.submit()}
            size="sm"
            type="button"
            variant="default"
          >
            {disabled ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      </footer>
    </>
  );
}

function IntakeSummary({ controller }: { controller: ReportBugController }) {
  const status = controller.status;
  let note: string;
  if (!status) {
    note = "Your report will be sent to our intake system for triage.";
  } else if (!status.sentryEnabled) {
    note = "Bug reporting isn't fully configured on this build — your report may not reach triage.";
  } else if (status.linearIntegrationMode === "disabled" || !status.linearConfigured) {
    note = "Your report will be sent to our intake system and reviewed by the team.";
  } else {
    note = "Your report will be sent to our intake system, and a tracking ticket may be created automatically for the team.";
  }
  return (
    <p className="mb-4 rounded-lg bg-surface-soft px-3 py-2 text-[13px] leading-snug text-ink-soft">
      {note}
    </p>
  );
}

function AttachmentsField({ controller }: { controller: ReportBugController }) {
  const disabled = controller.phase === "submitting" || controller.attachmentPickerPending;
  return (
    <Field label="Attachments" hint="Optional. Images are sent as screenshots; other files are included as attachments in the report request.">
      <div className="flex flex-col gap-2">
        <Button
          disabled={disabled}
          onClick={() => void controller.addAttachments()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Paperclip className="size-3.5" />
          {controller.attachmentPickerPending ? "Opening picker…" : "Attach files or screenshots"}
        </Button>
        {controller.draft.attachments.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {controller.draft.attachments.map((attachment) => (
              <li
                className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-soft px-2.5 py-1.5 text-xs"
                key={attachment.path}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{displayFileName(attachment.path)}</p>
                  <p className="truncate text-[11px] text-muted">
                    {attachment.kind === "screenshot" ? "Screenshot" : "File"} · {attachment.path}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${displayFileName(attachment.path)}`}
                  className="rounded-md p-1 text-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
                  disabled={controller.phase === "submitting"}
                  onClick={() => controller.removeAttachmentAt(attachment.path)}
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}

function ReportBugSuccessPanel({ controller }: { controller: ReportBugController }) {
  const outcome = resolveReportBugOutcomePresentation(controller.result);
  const reference = controller.result?.sentryEventId ?? null;
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-success-faint text-success">
          <CheckCircle2 className="size-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-lg font-semibold tracking-tight">{outcome.title}</h3>
          <p className="text-sm text-ink-soft">
            {outcome.detail}
          </p>
        </div>
        {reference ? (
          <div className="rounded-lg border border-line bg-surface-soft px-3 py-2 text-left text-xs">
            <p className="text-[11px] uppercase tracking-[0.11em] text-muted">Reference</p>
            <p className="mt-0.5 break-all font-mono text-ink">{reference}</p>
          </div>
        ) : null}
        {outcome.links.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {outcome.links.map((link) => (
              <a
                className="text-xs text-accent underline-offset-2 hover:underline"
                href={link.href}
                key={`${link.label}:${link.href}`}
                onClick={(event) => {
                  event.preventDefault();
                  void window.sense1Desktop?.window?.openExternalUrl(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-low px-5 py-3">
        <Button onClick={controller.resetAfterSuccess} size="sm" type="button" variant="default">
          Done
        </Button>
      </footer>
    </>
  );
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:opacity-60";

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline gap-1 text-[13px] font-medium text-ink">
        {label}
        {required ? <span className="text-danger">*</span> : null}
        {hint ? <span className="text-[12px] font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function displayFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/gu, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || filePath;
}
