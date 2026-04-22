import { useCallback, useEffect, useState } from "react";

import type {
  DesktopAppRemoveRequest,
  DesktopAppInstallRequest,
  DesktopAppEnabledRequest,
  DesktopExtensionOverviewResult,
  DesktopMcpServerAuthRequest,
  DesktopMcpServerAuthResult,
  DesktopMcpServerEnabledRequest,
  DesktopPluginInstallRequest,
  DesktopPluginUninstallRequest,
  DesktopPluginEnabledRequest,
  DesktopSkillEnabledRequest,
  DesktopSkillUninstallRequest,
} from "../../../main/contracts";
import { requireDesktopBridge } from "../../state/session/desktop-bridge.js";
import { shouldReloadManagementOverviewForRuntimeEvent } from "./management-runtime-events.ts";
import { tracePerfEvent } from "../../lib/perf-debug.ts";

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
    const startedAt = performance.now();
    try {
      const bridge = requireDesktopBridge();
      const nextOverview = await bridge.management.getOverview({
        forceRefetch,
      });
      const durationMs = Number((performance.now() - startedAt).toFixed(2));
      tracePerfEvent("management-overview", {
        appCount: nextOverview.apps.length,
        forceRefetch,
        loading: true,
        managedExtensionCount: nextOverview.managedExtensions.length,
        mcpServerCount: nextOverview.mcpServers.length,
        pluginCount: nextOverview.plugins.length,
        skillCount: nextOverview.skills.length,
        durationMs,
      }, {
        level: durationMs >= 100 ? "warn" : "info",
        minIntervalMs: 250,
        throttleKey: `management-overview:${forceRefetch ? "force" : "cached"}`,
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
        tracePerfEvent("management-runtime-event", {
          eventKind: event.kind,
        }, {
          level: "warn",
          minIntervalMs: 250,
          throttleKey: "management-runtime-event",
        });
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

  const startMcpServerAuth = useCallback(async (request: DesktopMcpServerAuthRequest): Promise<DesktopMcpServerAuthResult> => {
    const bridge = requireDesktopBridge();
    const result = await bridge.management.startMcpServerAuth(request);
    setOverview(result.overview);
    return result;
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
    startMcpServerAuth,
    uninstallPlugin,
    uninstallSkill,
  };
}
