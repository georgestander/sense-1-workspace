import { useCallback, useEffect, useState } from "react";

import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopExtensionOverviewResult,
  DesktopMcpServerEnabledRequest,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopPluginEnabledRequest,
  DesktopSkillEnabledRequest,
  DesktopSkillUninstallRequest,
} from "../../../main/contracts";
import { requireDesktopBridge } from "../../state/session/desktop-bridge.js";
import { shouldReloadManagementOverviewForRuntimeEvent } from "./management-runtime-events.ts";

export function useDesktopManagement({
  enabled,
}: {
  enabled: boolean;
}) {
  const [overview, setOverview] = useState<DesktopExtensionOverviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (forceRefetch = false) => {
    if (!enabled) {
      setOverview(null);
      setLoading(false);
      setError(null);
      return null;
    }
    setLoading(true);
    try {
      const bridge = requireDesktopBridge();
      const nextOverview = await bridge.management.getOverview({
        forceRefetch,
      });
      setOverview(nextOverview);
      setError(null);
      return nextOverview;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load plugins and skills.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const bridge = requireDesktopBridge();
    const unsubscribe = bridge.session.onRuntimeEvent((event) => {
      if (shouldReloadManagementOverviewForRuntimeEvent(event)) {
        void loadOverview(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, loadOverview]);

  const setPluginEnabled = useCallback(async (request: DesktopPluginEnabledRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.setPluginEnabled(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const installPlugin = useCallback(async (request: DesktopPluginInstallRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.installPlugin(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const uninstallPlugin = useCallback(async (request: DesktopPluginUninstallRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.uninstallPlugin(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const setAppEnabled = useCallback(async (request: DesktopAppEnabledRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.setAppEnabled(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const openAppInstall = useCallback(async (request: DesktopAppInstallRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.openAppInstall(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const removeApp = useCallback(async (request: DesktopAppRemoveRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.removeApp(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const setMcpServerEnabled = useCallback(async (request: DesktopMcpServerEnabledRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.setMcpServerEnabled(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const setSkillEnabled = useCallback(async (request: DesktopSkillEnabledRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.setSkillEnabled(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  const uninstallSkill = useCallback(async (request: DesktopSkillUninstallRequest) => {
    const bridge = requireDesktopBridge();
    const nextOverview = await bridge.management.uninstallSkill(request);
    setOverview(nextOverview);
    return nextOverview;
  }, []);

  return {
    error,
    installPlugin,
    loading,
    openAppInstall,
    overview,
    loadOverview,
    removeApp,
    setAppEnabled,
    setMcpServerEnabled,
    setPluginEnabled,
    setSkillEnabled,
    uninstallPlugin,
    uninstallSkill,
  };
}
