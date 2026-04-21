export interface RuntimeModelCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly defaultReasoningEffort?: string;
  readonly supportedReasoningEfforts: string[];
}

export declare function normalizeRuntimeModelCatalog(
  rawModels: unknown,
  options?: {
    accountType?: string | null;
    authMode?: string | null;
    allowedModels?: string[] | null;
  },
): RuntimeModelCatalogEntry[];

export declare function projectSupportedRuntimeModels(
  rawModels: unknown,
  options?: {
    accountType?: string | null;
    authMode?: string | null;
    allowedModels?: string[] | null;
  },
): Array<{
  id: string;
  supportedReasoningEfforts: string[];
}>;
