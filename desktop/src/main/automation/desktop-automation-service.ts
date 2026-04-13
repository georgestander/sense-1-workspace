import fs from "node:fs/promises";
import path from "node:path";

import { resolveProfileCodexHome } from "../profile/profile-state.js";
import type {
  DesktopAutomationDeleteRequest,
  DesktopAutomationDetailResult,
  DesktopAutomationListResult,
  DesktopAutomationRecord,
  DesktopAutomationRunRecord,
  DesktopAutomationSaveRequest,
} from "../contracts";

type DesktopAutomationServiceOptions = {
  env?: NodeJS.ProcessEnv;
  resolveProfile: () => Promise<{ id: string }>;
};

type StoredAutomation = Omit<DesktopAutomationRecord, "nextRunAt" | "lastRunAt" | "lastRunStatus" | "runCount">;

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "automation";
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function arrayToToml(values: string[]): string {
  return `[${values.map((value) => quote(value)).join(", ")}]`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickTomlString(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^${escapeRegex(key)}\\s*=\\s*(\".*\")$`, "m"));
  if (!match) {
    return null;
  }
  try {
    return typeof match[1] === "string" ? JSON.parse(match[1]) : null;
  } catch {
    return null;
  }
}

function pickTomlNumber(source: string, key: string): number | null {
  const match = source.match(new RegExp(`^${escapeRegex(key)}\\s*=\\s*(\\d+)$`, "m"));
  return match ? Number.parseInt(match[1], 10) : null;
}

function pickTomlArray(source: string, key: string): string[] {
  const match = source.match(new RegExp(`^${escapeRegex(key)}\\s*=\\s*\\[(.*)\\]$`, "m"));
  if (!match) {
    return [];
  }
  const raw = match[1].trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => firstString(entry.trim().replace(/^"|"$/g, "")))
    .filter((entry): entry is string => Boolean(entry));
}

function serializeAutomation(automation: StoredAutomation): string {
  return [
    "version = 1",
    `id = ${quote(automation.id)}`,
    `kind = ${quote(automation.kind)}`,
    `name = ${quote(automation.name)}`,
    `prompt = ${quote(automation.prompt)}`,
    `status = ${quote(automation.status)}`,
    `rrule = ${quote(automation.rrule)}`,
    `model = ${quote(automation.model)}`,
    `reasoning_effort = ${quote(automation.reasoningEffort)}`,
    `execution_environment = ${quote(automation.executionEnvironment)}`,
    `cwds = ${arrayToToml(automation.cwds)}`,
    `template = ${quote(automation.template ?? "")}`,
    `created_at = ${automation.createdAt}`,
    `updated_at = ${automation.updatedAt}`,
    "",
  ].join("\n");
}

function parseAutomation(source: string): StoredAutomation | null {
  const id = pickTomlString(source, "id");
  const kind = pickTomlString(source, "kind");
  const name = pickTomlString(source, "name");
  const prompt = pickTomlString(source, "prompt");
  const status = pickTomlString(source, "status");
  const rrule = pickTomlString(source, "rrule");
  const model = pickTomlString(source, "model");
  const reasoningEffort = pickTomlString(source, "reasoning_effort");
  const executionEnvironment = pickTomlString(source, "execution_environment");
  const createdAt = pickTomlNumber(source, "created_at");
  const updatedAt = pickTomlNumber(source, "updated_at");
  if (!id || !kind || !name || !prompt || !status || !rrule || !model || !reasoningEffort || !executionEnvironment || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    kind: kind as StoredAutomation["kind"],
    name,
    prompt,
    status: status as StoredAutomation["status"],
    rrule,
    model,
    reasoningEffort,
    executionEnvironment: executionEnvironment as StoredAutomation["executionEnvironment"],
    cwds: pickTomlArray(source, "cwds"),
    template: firstString(pickTomlString(source, "template")) ?? null,
    createdAt,
    updatedAt,
  };
}

function parseHistory(source: string): DesktopAutomationRunRecord[] {
  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed?.runs)
      ? parsed.runs.filter((entry: unknown): entry is DesktopAutomationRunRecord => Boolean(entry && typeof entry === "object"))
      : [];
  } catch {
    return [];
  }
}

function parseIntegerOrDefault(value: string | undefined, fallback: number): number {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function computeNextRunAt(rrule: string, status: string, now = new Date()): string | null {
  if (status !== "ACTIVE") {
    return null;
  }
  const normalized = rrule.replace(/^RRULE:/, "");
  const parts = Object.fromEntries(
    normalized.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );
  if (parts.FREQ === "HOURLY") {
    const interval = Math.max(1, Math.min(24, parseIntegerOrDefault(parts.INTERVAL, 1)));
    const minute = Math.max(0, Math.min(59, parseIntegerOrDefault(parts.BYMINUTE, 0)));
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setMinutes(minute);
    while (next <= now) {
      next.setHours(next.getHours() + interval);
    }
    return next.toISOString();
  }
  if (parts.FREQ === "DAILY") {
    const hour = Math.max(0, Math.min(23, parseIntegerOrDefault(parts.BYHOUR, 9)));
    const minute = Math.max(0, Math.min(59, parseIntegerOrDefault(parts.BYMINUTE, 0)));
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(hour, minute, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next.toISOString();
  }
  if (parts.FREQ === "WEEKLY") {
    const byDay = (parts.BYDAY ?? "").split(",").filter(Boolean);
    const hour = Math.max(0, Math.min(23, parseIntegerOrDefault(parts.BYHOUR, 9)));
    const minute = Math.max(0, Math.min(59, parseIntegerOrDefault(parts.BYMINUTE, 0)));
    const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const next = new Date(now);
    next.setSeconds(0, 0);
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = new Date(next);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate <= now) {
        continue;
      }
      if (byDay.includes(days[candidate.getDay()] ?? "")) {
        return candidate.toISOString();
      }
    }
  }
  return null;
}

export class DesktopAutomationService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #resolveProfile: () => Promise<{ id: string }>;

  constructor(options: DesktopAutomationServiceOptions) {
    this.#env = options.env ?? process.env;
    this.#resolveProfile = options.resolveProfile;
  }

  async #resolveAutomationRoot(): Promise<string> {
    const profile = await this.#resolveProfile();
    const root = path.join(resolveProfileCodexHome(profile.id, this.#env), "automations");
    await fs.mkdir(root, { recursive: true });
    return root;
  }

  async #resolveAutomationDir(id: string): Promise<string> {
    return path.join(await this.#resolveAutomationRoot(), id);
  }

  async #automationExists(id: string): Promise<boolean> {
    try {
      await fs.access(path.join(await this.#resolveAutomationDir(id), "automation.toml"));
      return true;
    } catch {
      return false;
    }
  }

  async #resolveCreateId(name: string): Promise<string> {
    const baseId = slugify(name);
    if (!await this.#automationExists(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (await this.#automationExists(`${baseId}-${suffix}`)) {
      suffix += 1;
    }
    return `${baseId}-${suffix}`;
  }

  async #writeAutomation(automation: StoredAutomation): Promise<void> {
    const automationDir = await this.#resolveAutomationDir(automation.id);
    await fs.mkdir(automationDir, { recursive: true });
    await fs.writeFile(path.join(automationDir, "automation.toml"), serializeAutomation(automation), "utf8");
  }

  async #readRuns(id: string): Promise<DesktopAutomationRunRecord[]> {
    try {
      const historyPath = path.join(await this.#resolveAutomationDir(id), "history.json");
      return parseHistory(await fs.readFile(historyPath, "utf8"));
    } catch {
      return [];
    }
  }

  async #writeRuns(id: string, runs: DesktopAutomationRunRecord[]): Promise<void> {
    const automationDir = await this.#resolveAutomationDir(id);
    await fs.mkdir(automationDir, { recursive: true });
    await fs.writeFile(
      path.join(automationDir, "history.json"),
      JSON.stringify({ runs }, null, 2),
      "utf8",
    );
  }

  #toRecord(automation: StoredAutomation, runs: DesktopAutomationRunRecord[]): DesktopAutomationRecord {
    const lastRun = runs[0] ?? null;
    return {
      ...automation,
      nextRunAt: computeNextRunAt(automation.rrule, automation.status),
      lastRunAt: lastRun?.startedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
      runCount: runs.length,
    };
  }

  async listAutomations(): Promise<DesktopAutomationListResult> {
    const root = await this.#resolveAutomationRoot();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const automations: DesktopAutomationRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      try {
        const automationDir = path.join(root, entry.name);
        const raw = await fs.readFile(path.join(automationDir, "automation.toml"), "utf8");
        const parsed = parseAutomation(raw);
        if (!parsed) {
          continue;
        }
        const runs = await this.#readRuns(parsed.id);
        automations.push(this.#toRecord(parsed, runs));
      } catch {
        // Ignore malformed automation directories.
      }
    }

    automations.sort((left, right) => right.updatedAt - left.updatedAt);
    return { automations };
  }

  async getAutomation(id: string): Promise<DesktopAutomationDetailResult> {
    const automationDir = await this.#resolveAutomationDir(id);
    const parsed = parseAutomation(await fs.readFile(path.join(automationDir, "automation.toml"), "utf8"));
    if (!parsed) {
      throw new Error(`Sense-1 could not read automation "${id}".`);
    }
    const runs = await this.#readRuns(id);
    return {
      automation: this.#toRecord(parsed, runs),
      runs,
    };
  }

  async saveAutomation(request: DesktopAutomationSaveRequest): Promise<DesktopAutomationDetailResult> {
    const now = Date.now();
    const id = firstString(request.id) ?? await this.#resolveCreateId(request.name);
    const existing = await this.getAutomation(id).catch(() => null);
    const stored: StoredAutomation = {
      id,
      kind: "cron",
      name: request.name.trim(),
      prompt: request.prompt.trim(),
      status: request.status,
      rrule: request.rrule.trim(),
      model: request.model.trim(),
      reasoningEffort: request.reasoningEffort.trim(),
      executionEnvironment: request.executionEnvironment,
      cwds: request.cwds.map((cwd) => cwd.trim()).filter(Boolean),
      template: firstString(request.template) ?? null,
      createdAt: existing?.automation.createdAt ?? now,
      updatedAt: now,
    };
    await this.#writeAutomation(stored);
    const runs = existing?.runs ?? [];
    await this.#writeRuns(id, runs);
    return {
      automation: this.#toRecord(stored, runs),
      runs,
    };
  }

  async deleteAutomation(request: DesktopAutomationDeleteRequest): Promise<void> {
    await fs.rm(await this.#resolveAutomationDir(request.id), {
      force: true,
      recursive: true,
    });
  }

  async recordAutomationRun(
    id: string,
    run: Omit<DesktopAutomationRunRecord, "id">,
  ): Promise<DesktopAutomationDetailResult> {
    const detail = await this.getAutomation(id);
    const updatedAt = Date.now();
    const stored: StoredAutomation = {
      id: detail.automation.id,
      kind: detail.automation.kind,
      name: detail.automation.name,
      prompt: detail.automation.prompt,
      status: detail.automation.status,
      rrule: detail.automation.rrule,
      model: detail.automation.model,
      reasoningEffort: detail.automation.reasoningEffort,
      executionEnvironment: detail.automation.executionEnvironment,
      cwds: [...detail.automation.cwds],
      template: detail.automation.template ?? null,
      createdAt: detail.automation.createdAt,
      updatedAt,
    };
    const nextRuns = [
      {
        ...run,
        id: `${id}-${Date.now()}`,
      },
      ...detail.runs,
    ].slice(0, 50);
    await this.#writeAutomation(stored);
    await this.#writeRuns(id, nextRuns);
    return {
      automation: this.#toRecord(stored, nextRuns),
      runs: nextRuns,
    };
  }
}
