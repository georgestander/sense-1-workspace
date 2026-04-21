export type ExhaustedCreditsReason = "usage-limit" | "quota" | "insufficient-balance";

export type ExhaustedCreditsDetection =
  | { matched: false }
  | { matched: true; reason: ExhaustedCreditsReason };

export type ExhaustedCreditsEntry = {
  readonly id: string;
  readonly kind: "activity";
  readonly title: string;
  readonly body: string;
  readonly status: "blocked";
};

const USAGE_LIMIT_CODE = "UsageLimitExceeded";

const KEYWORD_PATTERNS: Array<{ pattern: RegExp; reason: ExhaustedCreditsReason }> = [
  { pattern: /insufficient[_\s]?quota/i, reason: "quota" },
  { pattern: /exceeded\s+your\s+current\s+quota/i, reason: "quota" },
  { pattern: /check\s+your\s+plan/i, reason: "quota" },
  { pattern: /billing\s+hard\s+limit/i, reason: "quota" },
  { pattern: /usage\s+limit\s+(?:exceeded|reached)/i, reason: "usage-limit" },
  { pattern: /out\s+of\s+credits/i, reason: "insufficient-balance" },
  { pattern: /credit\s+balance/i, reason: "insufficient-balance" },
  { pattern: /insufficient\s+funds/i, reason: "insufficient-balance" },
  { pattern: /payment\s+required/i, reason: "insufficient-balance" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function collectErrorPayloads(params: Record<string, unknown> | null): Array<Record<string, unknown>> {
  if (!params) {
    return [];
  }

  const payloads: Array<Record<string, unknown>> = [];
  const seen = new Set<Record<string, unknown>>();

  function pushPayload(candidate: unknown) {
    const record = asRecord(candidate);
    if (!record || seen.has(record)) {
      return;
    }
    seen.add(record);
    payloads.push(record);
  }

  pushPayload(params);
  pushPayload(params.error);
  const turn = asRecord(params.turn);
  if (turn) {
    pushPayload(turn);
    pushPayload(turn.error);
  }
  return payloads;
}

function resolveTurnStatus(params: Record<string, unknown> | null): string | null {
  if (!params) {
    return null;
  }
  const turn = asRecord(params.turn);
  return firstString(turn?.status, params.status);
}

export function detectExhaustedCreditsFailure(message: unknown): ExhaustedCreditsDetection {
  const record = asRecord(message);
  if (!record) {
    return { matched: false };
  }

  const method = firstString(record.method);
  if (method !== "turn/completed" && method !== "turn/failed") {
    return { matched: false };
  }

  const params = asRecord(record.params);
  const status = resolveTurnStatus(params)?.toLowerCase() ?? null;
  if (method === "turn/completed" && status !== "failed") {
    return { matched: false };
  }

  const payloads = collectErrorPayloads(params);
  if (payloads.length === 0) {
    return { matched: false };
  }

  for (const payload of payloads) {
    const code = firstString(payload.errorCode, payload.code, payload.error_code);
    if (code === USAGE_LIMIT_CODE) {
      return { matched: true, reason: "usage-limit" };
    }
  }

  for (const payload of payloads) {
    const text = firstString(
      payload.errorMessage,
      payload.message,
      payload.error_message,
      payload.detail,
    );
    if (!text) {
      continue;
    }
    for (const { pattern, reason } of KEYWORD_PATTERNS) {
      if (pattern.test(text)) {
        return { matched: true, reason };
      }
    }
  }

  return { matched: false };
}

function entryTitle(): string {
  return "API credits ran out";
}

function entryBody(reason: ExhaustedCreditsReason): string {
  const intro =
    reason === "usage-limit"
      ? "This run stopped because the OpenAI API key hit its usage limit."
      : reason === "quota"
        ? "This run stopped because the OpenAI API key is out of quota."
        : "This run stopped because the OpenAI API key is out of credits.";
  return `${intro} Add funds at https://platform.openai.com/account/billing, or sign out and switch to ChatGPT sign-in, then retry.`;
}

export function buildExhaustedCreditsEntry({
  threadId,
  reason,
  now = Date.now(),
}: {
  threadId: string;
  reason: ExhaustedCreditsReason;
  now?: number;
}): ExhaustedCreditsEntry {
  return {
    id: `api-key-credits-${threadId}-${now}`,
    kind: "activity",
    title: entryTitle(),
    body: entryBody(reason),
    status: "blocked",
  };
}

export function isApiKeyAccountType(accountType: string | null | undefined): boolean {
  if (typeof accountType !== "string") {
    return false;
  }
  return accountType.trim().toLowerCase() === "apikey";
}
