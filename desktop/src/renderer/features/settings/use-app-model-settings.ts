import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { DesktopModelEntry, DesktopSettings } from "../../../main/contracts";
import {
  resolveModelEntry,
  resolveModelSettingsUpdate,
  resolveModelSelection,
  resolveReasoningOptions,
  resolveReasoningSelection,
} from "../../lib/model-catalog.js";

export const REASONING_LABELS: Record<string, string> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

type SaveSettings = (patch: {
  model?: string;
  reasoningEffort?: string;
}) => Promise<unknown>;

type UseAppModelSettingsParams = {
  availableModels: DesktopModelEntry[];
  model: string;
  reasoning: string;
  selectedThreadId: string | null;
  setModel: Dispatch<SetStateAction<string>>;
  setReasoning: Dispatch<SetStateAction<string>>;
  settingsData: DesktopSettings | null;
  saveSettings: SaveSettings;
};

export function useAppModelSettings({
  availableModels,
  model,
  reasoning,
  selectedThreadId,
  setModel,
  setReasoning,
  settingsData,
  saveSettings,
}: UseAppModelSettingsParams) {
  const modelOptions = availableModels.map((entry) => entry.id);
  const selectedModel = resolveModelSelection({
    models: availableModels,
    requestedModel: model,
  });
  const selectedReasoning = resolveReasoningSelection({
    models: availableModels,
    modelId: selectedModel,
    requestedReasoning: reasoning,
  });
  const reasoningOptions = resolveReasoningOptions({
    models: availableModels,
    modelId: selectedModel,
    requestedReasoning: reasoning,
  });
  const settingsModel = settingsData
    ? resolveModelSelection({
        models: availableModels,
        requestedModel: settingsData.model,
      })
    : selectedModel;
  const settingsModelEntry = resolveModelEntry({
    models: availableModels,
    requestedModel: settingsModel,
  });
  const settingsReasoning = settingsData
    ? resolveReasoningSelection({
        models: availableModels,
        modelId: settingsModel,
        requestedReasoning: settingsData.reasoningEffort,
      })
    : selectedReasoning;
  const settingsReasoningOptions = settingsModelEntry?.supportedReasoningEfforts?.length
    ? settingsModelEntry.supportedReasoningEfforts
    : resolveReasoningOptions({
        models: availableModels,
        modelId: settingsModel,
        requestedReasoning: settingsData?.reasoningEffort ?? selectedReasoning,
      });

  const prevModelRef = useRef(selectedModel);
  const prevReasoningRef = useRef(selectedReasoning);
  const [configNotices, setConfigNotices] = useState<Array<{ id: number; text: string }>>([]);
  const configNoticeIdRef = useRef(0);

  useEffect(() => {
    if (availableModels.length === 0) {
      return;
    }
    const nextModel = resolveModelSelection({
      models: availableModels,
      requestedModel: model,
    });
    const nextReasoning = resolveReasoningSelection({
      models: availableModels,
      modelId: nextModel,
      requestedReasoning: reasoning,
    });
    if (nextModel !== model) {
      setModel(nextModel);
    }
    if (nextReasoning !== reasoning) {
      setReasoning(nextReasoning);
    }
  }, [availableModels, model, reasoning, setModel, setReasoning]);

  useEffect(() => {
    const prev = prevModelRef.current;
    prevModelRef.current = selectedModel;
    if (prev && prev !== selectedModel) {
      const toLabel = availableModels.find((entry) => entry.id === selectedModel)?.name ?? selectedModel;
      const id = ++configNoticeIdRef.current;
      setConfigNotices((current) => [...current, { id, text: `Model changed to ${toLabel}` }]);
      setTimeout(() => {
        setConfigNotices((current) => current.filter((notice) => notice.id !== id));
      }, 3000);
    }
  }, [selectedModel, availableModels]);

  useEffect(() => {
    const prev = prevReasoningRef.current;
    prevReasoningRef.current = selectedReasoning;
    if (prev && prev !== selectedReasoning) {
      const toLabel = REASONING_LABELS[selectedReasoning] ?? selectedReasoning;
      const id = ++configNoticeIdRef.current;
      setConfigNotices((current) => [...current, { id, text: `Reasoning effort changed to ${toLabel}` }]);
      setTimeout(() => {
        setConfigNotices((current) => current.filter((notice) => notice.id !== id));
      }, 3000);
    }
  }, [selectedReasoning]);

  useEffect(() => {
    setConfigNotices([]);
  }, [selectedThreadId]);

  function handleModelSelection(nextModel: string) {
    const nextSettings = resolveModelSettingsUpdate({
      models: availableModels,
      requestedModel: nextModel,
      requestedReasoning: selectedReasoning,
    });
    setModel(nextSettings.model);
    setReasoning(nextSettings.reasoningEffort);
    void saveSettings({
      model: nextSettings.model,
      reasoningEffort: nextSettings.reasoningEffort,
    });
  }

  function saveSettingsModelSelection(nextModel: string) {
    const nextSettings = resolveModelSettingsUpdate({
      models: availableModels,
      requestedModel: nextModel,
      requestedReasoning: settingsData?.reasoningEffort ?? settingsReasoning,
    });
    void saveSettings({
      model: nextSettings.model,
      reasoningEffort: nextSettings.reasoningEffort,
    });
  }

  return {
    REASONING_LABELS,
    configNotices,
    handleModelSelection,
    modelOptions,
    reasoningOptions,
    saveSettingsModelSelection,
    selectedModel,
    selectedReasoning,
    settingsModel,
    settingsReasoning,
    settingsReasoningOptions,
  };
}
