export interface DesktopModelEntry {
  readonly id: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly defaultReasoningEffort?: string;
  readonly supportedReasoningEfforts: string[];
}

export interface DesktopModelListResult {
  readonly models: DesktopModelEntry[];
}
