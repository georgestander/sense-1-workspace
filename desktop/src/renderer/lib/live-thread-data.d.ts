import type {
  DesktopAppServerItem,
  DesktopAppServerThread,
  DesktopThreadSummary,
} from "../main/contracts";

export type DesktopThreadEntry =
  | {
      id: string;
      kind: "user" | "assistant" | "tool" | "review" | "activity";
      title: string;
      body: string;
      promptShortcuts?: Array<{
        kind: "app" | "plugin" | "skill";
        label: string;
        token: string;
      }>;
      status?: string;
    }
  | {
      id: string;
      kind: "reasoning";
      title: string;
      summary: string;
      body: string;
    }
  | {
      id: string;
      kind: "plan";
      title: string;
      body: string;
      steps: string[];
    }
  | {
      id: string;
      kind: "command";
      title: string;
      body: string;
      command: string;
      cwd: string | null;
      status: string;
      exitCode: number | null;
      durationMs: number | null;
    }
  | {
      id: string;
      kind: "fileChange";
      title: string;
      status: string;
      changes: Array<{ path?: string; kind?: string; diff?: string }>;
    };

export interface DesktopChangeGroup {
  id: string;
  title: string;
  status: string;
  files: string[];
}

export function formatUpdatedLabel(raw: unknown): string;
export function normalizeDesktopSummary(
  summary: DesktopThreadSummary,
  workspaceRoot?: string | null,
  cwd?: string | null,
): DesktopThreadSummary & {
  updatedLabel: string;
  workspaceRoot: string | null;
  cwd: string | null;
};
export function normalizeLiveThread(
  thread: DesktopAppServerThread | null | undefined,
  workspaceRoot?: string | null,
  cwd?: string | null,
): DesktopThreadSummary & {
  updatedLabel: string;
  workspaceRoot: string | null;
  cwd: string | null;
};
export function flattenThreadItems(
  thread:
    | (DesktopAppServerThread & {
        turns?: Array<{ items?: DesktopAppServerItem[] }>;
      })
    | null
    | undefined,
): DesktopAppServerItem[];
export function mapItemToThreadEntry(item: DesktopAppServerItem): DesktopThreadEntry | null;
export function buildThreadEntries(items: DesktopAppServerItem[]): DesktopThreadEntry[];
export function buildChangeGroups(entries: DesktopThreadEntry[], diffs?: unknown[]): DesktopChangeGroup[];
export function buildProgressSummary(entries: DesktopThreadEntry[], threadState: string, diffs?: unknown[]): string[];
