import type { DesktopBridge, DesktopModelEntry } from "../../../main/contracts";
import { normalizeModelCatalog, writeCachedModelCatalog } from "../../lib/model-catalog.js";

export type RuntimeModelCatalogSyncArgs = {
  bridge: Pick<DesktopBridge, "models">;
  setAvailableModels: (models: DesktopModelEntry[]) => void;
  isActive: () => boolean;
};

export async function syncRuntimeModelCatalog({
  bridge,
  setAvailableModels,
  isActive,
}: RuntimeModelCatalogSyncArgs): Promise<void> {
  try {
    const result = await bridge.models.list();
    const normalizedModels = normalizeModelCatalog(result.models);
    if (isActive() && normalizedModels.length > 0) {
      setAvailableModels(normalizedModels);
      writeCachedModelCatalog(normalizedModels);
    }
  } catch {
    // Non-fatal — the renderer will continue with the last known-good model catalog.
  }
}
