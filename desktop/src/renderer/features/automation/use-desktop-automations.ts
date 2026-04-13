import { useCallback, useEffect, useState } from "react";

import type {
  DesktopAutomationDetailResult,
  DesktopAutomationRecord,
  DesktopAutomationSaveRequest,
} from "../../../main/contracts";
import { requireDesktopBridge } from "../../state/session/desktop-bridge.js";

export function useDesktopAutomations({ isSignedIn }: { isSignedIn: boolean }) {
  const [automations, setAutomations] = useState<DesktopAutomationRecord[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [selectedAutomation, setSelectedAutomation] = useState<DesktopAutomationDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAutomations = useCallback(async () => {
    if (!isSignedIn) {
      setAutomations([]);
      setSelectedAutomationId(null);
      setSelectedAutomation(null);
      return;
    }
    setLoading(true);
    try {
      const bridge = requireDesktopBridge();
      const result = await bridge.automations.list();
      setAutomations(result.automations);
      setSelectedAutomationId((current) => current && result.automations.some((automation) => automation.id === current)
        ? current
        : null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load automations.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  const loadAutomationDetail = useCallback(async (id: string | null) => {
    if (!id || !isSignedIn) {
      setSelectedAutomation(null);
      return;
    }
    setLoading(true);
    try {
      const bridge = requireDesktopBridge();
      const detail = await bridge.automations.get(id);
      setSelectedAutomation(detail);
      setError(null);
    } catch (loadError) {
      setSelectedAutomation(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load automation details.");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  useEffect(() => {
    void loadAutomationDetail(selectedAutomationId);
  }, [loadAutomationDetail, selectedAutomationId]);

  const saveAutomation = useCallback(async (request: DesktopAutomationSaveRequest) => {
    setSaving(true);
    try {
      const bridge = requireDesktopBridge();
      const detail = await bridge.automations.save(request);
      setSelectedAutomation(detail);
      setSelectedAutomationId(detail.automation.id);
      await loadAutomations();
      return detail;
    } finally {
      setSaving(false);
    }
  }, [loadAutomations]);

  const deleteAutomation = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const bridge = requireDesktopBridge();
      await bridge.automations.delete({ id });
      setSelectedAutomationId(null);
      setSelectedAutomation(null);
      await loadAutomations();
    } finally {
      setSaving(false);
    }
  }, [loadAutomations]);

  const runAutomationNow = useCallback(async (id: string) => {
    setSaving(true);
    try {
      const bridge = requireDesktopBridge();
      const detail = await bridge.automations.runNow({ id });
      setSelectedAutomation(detail);
      await loadAutomations();
      return detail;
    } finally {
      setSaving(false);
    }
  }, [loadAutomations]);

  return {
    automations,
    deleteAutomation,
    error,
    loadAutomations,
    loading,
    runAutomationNow,
    saveAutomation,
    saving,
    selectedAutomation,
    selectedAutomationId,
    setSelectedAutomationId,
  };
}
