import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "./ui/button";
import type {
  DesktopAutomationDetailResult,
  DesktopAutomationRecord,
  DesktopAutomationSaveRequest,
} from "../../main/contracts";
import { AutomationDialog } from "./automations/AutomationDialog";
import { AutomationRow } from "./automations/AutomationRow";
import { AUTOMATION_ALPHA_NOTE } from "./automations/automation-form-utils";

type AutomationsPageProps = {
  automations: DesktopAutomationRecord[];
  deleteAutomation: (id: string) => Promise<void>;
  error: string | null;
  loading: boolean;
  projectOptions: string[];
  runAutomationNow: (id: string) => Promise<DesktopAutomationDetailResult | undefined>;
  saveAutomation: (request: DesktopAutomationSaveRequest) => Promise<DesktopAutomationDetailResult>;
  saving: boolean;
  selectedAutomation: DesktopAutomationDetailResult | null;
  selectedAutomationId: string | null;
  setSelectedAutomationId: (id: string | null) => void;
};

export function AutomationsPage({
  automations,
  deleteAutomation,
  error,
  loading,
  projectOptions,
  runAutomationNow,
  saveAutomation,
  saving,
  selectedAutomation,
  selectedAutomationId,
  setSelectedAutomationId,
}: AutomationsPageProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (selectedAutomationId) {
      setDialogOpen(true);
    }
  }, [selectedAutomationId]);

  function handleNewAutomation() {
    setSelectedAutomationId(null);
    setDialogOpen(true);
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setSelectedAutomationId(null);
  }

  async function handleSave(request: DesktopAutomationSaveRequest) {
    const detail = await saveAutomation(request);
    setSelectedAutomationId(detail.automation.id);
  }

  async function handleDelete() {
    if (!selectedAutomationId) {
      return;
    }
    await deleteAutomation(selectedAutomationId);
    handleCloseDialog();
  }

  async function handleRunNow() {
    if (!selectedAutomationId) {
      return;
    }
    await runAutomationNow(selectedAutomationId);
  }

  const showLoadingEmpty = loading && automations.length === 0;
  const detailIsLoading = Boolean(
    selectedAutomationId &&
      (!selectedAutomation || selectedAutomation.automation.id !== selectedAutomationId),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-start justify-between gap-4 border-b border-line px-8 py-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Automations</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink-muted">{AUTOMATION_ALPHA_NOTE}</p>
        </div>
        <Button onClick={handleNewAutomation} variant="default">
          <Plus />
          New automation
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        {error ? (
          <p className="mb-4 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">{error}</p>
        ) : null}

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.11em] text-muted">Current</h2>
          {showLoadingEmpty ? (
            <p className="rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">
              Loading automations...
            </p>
          ) : null}
          {!showLoadingEmpty && automations.length === 0 ? (
            <p className="rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">
              No automations yet. Create one to schedule recurring work in a workspace folder.
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {automations.map((automation) => (
              <AutomationRow
                automation={automation}
                key={automation.id}
                onSelect={(id) => {
                  setSelectedAutomationId(id);
                  setDialogOpen(true);
                }}
                selected={selectedAutomationId === automation.id}
              />
            ))}
          </div>
        </section>
      </main>

      {dialogOpen ? (
        <AutomationDialog
          automation={selectedAutomation}
          loading={detailIsLoading}
          onClose={handleCloseDialog}
          onDelete={handleDelete}
          onRunNow={handleRunNow}
          onSave={handleSave}
          projectOptions={projectOptions}
          saving={saving}
        />
      ) : null}
    </div>
  );
}
