export interface DesktopSettings {
  readonly model: string;
  readonly reasoningEffort: string;
  readonly personality: "none" | "friendly" | "pragmatic";
  readonly defaultOperatingMode: "preview" | "auto" | "apply";
  readonly runtimeInstructions: string;
  readonly approvalPosture: "onRequest" | "unlessTrusted" | "never";
  readonly sandboxPosture: "workspaceWrite" | "readOnly";
  readonly adminApprovalPosture: "requireAll" | "requireRisky" | "none";
  readonly roleApprovalLevel: "ownerOnly" | "anyAuthenticated";
  readonly workspaceReadonly: "allow" | "readonly";
  readonly workspaceFolderBinding: "inherit" | "none";
  readonly approvalOperationPosture: "askAll" | "askRisky" | "autoAll";
  readonly approvalTrustedWorkspaces: string;
  readonly trustedSkillApprovals: string[];
}

export interface DesktopSettingsUpdateRequest {
  readonly settings: Partial<DesktopSettings>;
}

export interface DesktopSettingsResult {
  readonly settings: DesktopSettings;
}

export interface DesktopPolicyRule {
  readonly id: string;
  readonly label: string;
  readonly currentValue: string | null;
  readonly description: string;
}

export interface DesktopPolicyRuleGroup {
  readonly id: string;
  readonly topic: string;
  readonly rules: DesktopPolicyRule[];
}

export interface DesktopPolicyRulesResult {
  readonly groups: DesktopPolicyRuleGroup[];
}
