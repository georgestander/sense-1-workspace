export function normalizeSkillApprovalPath(value: string | null | undefined): string | null;
export function buildSkillApprovalKey(skillPath: string, versionToken: string): string;
export function parseSkillApprovalKey(entry: string | null | undefined): {
  path: string | null;
  versionToken: string | null;
};
export function matchesSkillApprovalPath(entry: string, skillPath: string): boolean;
export function commandMatchesSkillApprovalPath(command: unknown, entry: string | null | undefined): boolean;
export function isSkillApprovalPath(skillPath: string | null | undefined): boolean;
