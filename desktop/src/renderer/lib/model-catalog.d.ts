import type { DesktopModelEntry } from "../main/contracts";

export const MODEL_CATALOG_CACHE_KEY: string;

export declare function normalizeModelCatalog(entries: unknown): DesktopModelEntry[];
export declare function readCachedModelCatalog(storage?: Storage | null): DesktopModelEntry[];
export declare function writeCachedModelCatalog(models: unknown, storage?: Storage | null): void;
export declare function resolveModelSelection(args: {
  models: DesktopModelEntry[];
  requestedModel: string;
}): string;
export declare function resolveModelEntry(args: {
  models: DesktopModelEntry[];
  requestedModel: string;
}): DesktopModelEntry | null;
export declare function resolveReasoningSelection(args: {
  models: DesktopModelEntry[];
  modelId: string;
  requestedReasoning: string;
}): string;
export declare function resolveReasoningOptions(args: {
  models: DesktopModelEntry[];
  modelId: string;
  requestedReasoning: string;
}): string[];
export declare function resolveModelSettingsUpdate(args: {
  models: DesktopModelEntry[];
  requestedModel: string;
  requestedReasoning: string;
}): {
  model: string;
  reasoningEffort: string;
};
