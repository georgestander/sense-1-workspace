import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { DesktopModelEntry, DesktopSettings } from "../../../main/contracts";
import {
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
  serviceTier?: "flex" | "fast";
}) => Promise<unknown>;

type UseAppModelSettingsParams = {
  availableModels: DesktopModelEntry[];
  model: string;
  reasoning: string;
  serviceTier: "flex" | "fast";
  selectedThreadId: string | null;
  setModel: Dispatch<SetStateAction<string>>;
  setReasoning: Dispatch<SetStateAction<string>>;
  setServiceTier: Dispatch<SetStateAction<"flex" | "fast">>;
  settingsData: DesktopSettings | null;
  saveSettings: SaveSettings;
};

export function useAppModelSettings({
  availableModels,
  model,
  reasoning,
  serviceTier,
  selectedThreadId,
  setModel,
  setReasoning,
  setServiceTier,
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
  const settingsReasoning = settingsData
    ? resolveReasoningSelection({
        models: availableModels,
        modelId: settingsModel,
        requestedReasoning: settingsData.reasoningEffort,
      })
    : selectedReasoning;
  const settingsReasoningOptions = resolveReasoningOptions({
    models: availableModels,
    modelId: settingsModel,
    requestedReasoning: settingsData?.reasoningEffort ?? selectedReasoning,
  });
  const selectedServiceTier: "flex" | "fast" = serviceTier === "fast" ? "fast" : "flex";
  const settingsServiceTier: "flex" | "fast" = settingsData?.serviceTier === "fast" ? "fast" : "flex";

  const prevModelRef = useRef(selectedModel);
  const prevReasoningRef = useRef(selectedReasoning);
  const prevServiceTierRef = useRef(selectedServiceTier);
  const [configNotices, setConfigNotices] = useState<Array<{ id: number; text: string }>>([]);
  const configNoticeIdRef = useRef(0);

  function pushConfigNotice(text: string) {
    const id = ++configNoticeIdRef.current;
    setConfigNotices((current) => [...current, { id, text }]);
    setTimeout(() => {
      setConfigNotices((current) => current.filter((notice) => notice.id !== id));
    }, 3000);
  }

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
      pushConfigNotice(`Model changed to ${toLabel}`);
    }
  }, [selectedModel, availableModels]);

  useEffect(() => {
    const prev = prevReasoningRef.current;
    prevReasoningRef.current = selectedReasoning;
    if (prev && prev !== selectedReasoning) {
      const toLabel = REASONING_LABELS[selectedReasoning] ?? selectedReasoning;
      pushConfigNotice(`Reasoning effort changed to ${toLabel}`);
    }
  }, [selectedReasoning]);

  useEffect(() => {
    const prev = prevServiceTierRef.current;
    prevServiceTierRef.current = selectedServiceTier;
    if (!prev || prev === selectedServiceTier) {
      return;
    }

    pushConfigNotice(
      selectedServiceTier === "fast"
        ? "Fast mode enabled"
        : "Fast mode disabled",
    );
  }, [selectedServiceTier]);

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

  function handleServiceTierSelection(nextServiceTier: "flex" | "fast") {
    setServiceTier(nextServiceTier);
    void saveSettings({
      serviceTier: nextServiceTier,
    });
  }

  return {
    REASONING_LABELS,
    configNotices,
    handleModelSelection,
    handleServiceTierSelection,
    modelOptions,
    pushConfigNotice,
    reasoningOptions,
    saveSettingsModelSelection,
    selectedModel,
    selectedReasoning,
    selectedServiceTier,
    settingsModel,
    settingsReasoning,
    settingsReasoningOptions,
    settingsServiceTier,
  };
}
