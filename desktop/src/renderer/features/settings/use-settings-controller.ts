import { useEffect, useRef, useState } from "react";

import type { DesktopSettings } from "../../../main/contracts";

const DEFAULT_MODEL = "";
const DEFAULT_REASONING_EFFORT = "";
const DEFAULT_SERVICE_TIER = "flex";

function sanitizeSettingsErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '.*?':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .trim();
}

export function useSettingsController({
  isSignedIn,
  selectedProfileId,
  setModel,
  setReasoning,
  setServiceTier,
}: {
  isSignedIn: boolean;
  selectedProfileId: string;
  setModel: (value: string) => void;
  setReasoning: (value: string) => void;
  setServiceTier: (value: "flex" | "fast") => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<DesktopSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<{ key: string; message: string } | null>(null);
  const [settingsSection, setSettingsSection] = useState("general");
  const loadRequestIdRef = useRef(0);

  async function loadSettings(): Promise<void> {
    const bridge = window.sense1Desktop;
    if (!bridge?.settings?.get) {
      return;
    }

    const requestId = ++loadRequestIdRef.current;
    try {
      const result = await bridge.settings.get();
      if (requestId !== loadRequestIdRef.current) {
        return;
      }
      setSettingsData(result.settings);
      setModel(result.settings.model);
      setReasoning(result.settings.reasoningEffort);
      setServiceTier(result.settings.serviceTier);
    } catch {
      // Use the current visible state as a fallback.
    }
  }

  useEffect(() => {
    if (!isSignedIn) {
      loadRequestIdRef.current += 1;
      setSettingsData(null);
      setSettingsSaving(false);
      setSettingsError(null);
      setSettingsSection("general");
      setModel(DEFAULT_MODEL);
      setReasoning(DEFAULT_REASONING_EFFORT);
      setServiceTier(DEFAULT_SERVICE_TIER);
      return;
    }

    void loadSettings();
  }, [isSignedIn, selectedProfileId, setModel, setReasoning, setServiceTier]);

  useEffect(() => {
    if (!settingsError) {
      return;
    }

    const timer = setTimeout(() => setSettingsError(null), 5000);
    return () => clearTimeout(timer);
  }, [settingsError]);

  async function openSettings() {
    setSettingsOpen(true);
    setSettingsSection("general");
    setSettingsError(null);
    await loadSettings();
  }

  async function saveSettings(updates: Partial<DesktopSettings>) {
    const failedKey = Object.keys(updates)[0] ?? "unknown";
    setSettingsSaving(true);
    if (settingsError?.key === failedKey) {
      setSettingsError(null);
    }

    try {
      const bridge = window.sense1Desktop;
      if (bridge?.settings?.update) {
        const result = await bridge.settings.update({ settings: updates });
        setSettingsData(result.settings);
        setModel(result.settings.model);
        setReasoning(result.settings.reasoningEffort);
        setServiceTier(result.settings.serviceTier);
      }
    } catch (error) {
      const message = sanitizeSettingsErrorMessage(
        error instanceof Error ? error.message : "Could not save desktop settings.",
      );
      setSettingsError({ key: failedKey, message });
      try {
        const bridge = window.sense1Desktop;
        if (bridge?.settings?.get) {
          const result = await bridge.settings.get();
          setSettingsData(result.settings);
          setModel(result.settings.model);
          setReasoning(result.settings.reasoningEffort);
          setServiceTier(result.settings.serviceTier);
        }
      } catch {
        // Leave the current values visible if reload also fails.
      }
    } finally {
      setSettingsSaving(false);
    }
  }

  return {
    openSettings,
    saveSettings,
    settingsData,
    settingsError,
    settingsOpen,
    settingsSaving,
    settingsSection,
    setSettingsOpen,
    setSettingsSection,
  };
}
