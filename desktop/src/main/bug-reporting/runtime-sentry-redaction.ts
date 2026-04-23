import { redactSensitivePath, redactSensitiveText, resolveRedactionHomeDir } from "./redaction.ts";

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function redactRuntimeDiagnosticText(value: string, env: NodeJS.ProcessEnv): string {
  return redactSensitivePath(redactSensitiveText(value), resolveRedactionHomeDir(env));
}

export function redactRuntimeErrorForSentry(
  error: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Error {
  const message = redactRuntimeDiagnosticText(formatError(error), env);
  if (!(error instanceof Error)) {
    return new Error(message);
  }

  const stack = error.stack ? redactRuntimeDiagnosticText(error.stack, env) : undefined;
  if (error.message === message && error.stack === stack) {
    return error;
  }

  const redactedError = new Error(message);
  redactedError.name = error.name || "Sense1RuntimeTransportError";
  if (stack) {
    redactedError.stack = stack;
  }
  return redactedError;
}

export function redactRuntimeTextForSentry(value: string, env: NodeJS.ProcessEnv): string {
  return redactRuntimeDiagnosticText(value, env);
}
