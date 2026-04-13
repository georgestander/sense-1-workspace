export type DesktopAutomationStatus = "ACTIVE" | "PAUSED";
export type DesktopAutomationKind = "cron";
export type DesktopAutomationExecutionEnvironment = "local" | "worktree";
export type DesktopAutomationRunStatus = "started" | "completed" | "failed";

export interface DesktopAutomationRecord {
  readonly id: string;
  readonly kind: DesktopAutomationKind;
  readonly name: string;
  readonly prompt: string;
  readonly status: DesktopAutomationStatus;
  readonly rrule: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly executionEnvironment: DesktopAutomationExecutionEnvironment;
  readonly cwds: string[];
  readonly template: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly nextRunAt: string | null;
  readonly lastRunAt: string | null;
  readonly lastRunStatus: DesktopAutomationRunStatus | null;
  readonly runCount: number;
}

export interface DesktopAutomationRunRecord {
  readonly id: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: DesktopAutomationRunStatus;
  readonly threadId: string | null;
  readonly note: string | null;
}

export interface DesktopAutomationListResult {
  readonly automations: DesktopAutomationRecord[];
}

export interface DesktopAutomationDetailResult {
  readonly automation: DesktopAutomationRecord;
  readonly runs: DesktopAutomationRunRecord[];
}

export interface DesktopAutomationSaveRequest {
  readonly id?: string;
  readonly name: string;
  readonly prompt: string;
  readonly status: DesktopAutomationStatus;
  readonly rrule: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly executionEnvironment: DesktopAutomationExecutionEnvironment;
  readonly cwds: string[];
  readonly template?: string | null;
}

export interface DesktopAutomationDeleteRequest {
  readonly id: string;
}

export interface DesktopAutomationRunNowRequest {
  readonly id: string;
}
