const DEFAULT_SENTRY_DSN =
  "https://459c4631425b2df5faf5cb85b5aab0a9@o4511250952224768.ingest.de.sentry.io/4511250957205584";

type SentryEnv = {
  NODE_ENV?: string | undefined;
  SENSE1_SENTRY_DSN?: string | undefined;
  SENSE1_SENTRY_DEBUG?: string | undefined;
};

function firstNonEmptyString(...values: Array<unknown>): string | null {
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

export function resolveSentryDsn(env: SentryEnv = {}): string {
  return firstNonEmptyString(env.SENSE1_SENTRY_DSN, DEFAULT_SENTRY_DSN) ?? DEFAULT_SENTRY_DSN;
}

export function resolveSentryEnvironment(env: SentryEnv = {}): string {
  return firstNonEmptyString(env.NODE_ENV, "development") ?? "development";
}

export function resolveSentryRelease(appVersion: string): string {
  return `sense-1-workspace@${firstNonEmptyString(appVersion, "unknown") ?? "unknown"}`;
}

export function resolveSentryDist(buildId: string | null | undefined): string | undefined {
  return firstNonEmptyString(buildId) ?? undefined;
}

export function shouldEnableSentryDebug(env: SentryEnv = {}): boolean {
  return env.SENSE1_SENTRY_DEBUG === "1";
}
