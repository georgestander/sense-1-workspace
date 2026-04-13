export interface DesktopInputChoice {
  readonly label: string;
  readonly description?: string | null;
  readonly value?: string | null;
}

export interface DesktopInputQuestion {
  readonly id?: string | null;
  readonly header?: string | null;
  readonly question: string;
  readonly isOther: boolean;
  readonly choices: DesktopInputChoice[];
}

export interface DesktopPlanStep {
  readonly step: string;
  readonly status: "pending" | "inProgress" | "completed";
}

export interface DesktopPlanState {
  readonly explanation: string | null;
  readonly text: string | null;
  readonly steps: string[];
  readonly planSteps: DesktopPlanStep[];
  readonly scopeSummary: string | null;
  readonly expectedOutputSummary: string | null;
}

export interface DesktopFolderSummary {
  readonly path: string;
  readonly name: string;
  readonly lastUsedAt: string | null;
}

export interface DesktopProfileOption {
  readonly id: string;
  readonly label: string;
}

export interface DesktopInputRequestState {
  readonly requestId: number | null;
  readonly prompt: string;
  readonly threadId: string;
  readonly questions: DesktopInputQuestion[];
}

export interface DesktopQueuedThreadInput {
  readonly id: string;
  readonly text: string;
  readonly enqueuedAt: string;
}

export interface DesktopThreadInputState {
  readonly queuedMessages: DesktopQueuedThreadInput[];
  readonly hasUnseenCompletion: boolean;
  readonly lastCompletionAt: string | null;
  readonly lastCompletionStatus: "completed" | "failed" | "interrupted" | null;
}
