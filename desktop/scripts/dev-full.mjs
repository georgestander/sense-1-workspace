#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const processGroupSignalsSupported = process.platform !== "win32";

const managedChildren = [];
let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(0, `received ${signal}`);
  });
}

try {
  logSummary("starting desktop-only flow (main process owns local runtime)");
  logSummary("starting desktop app");
  startManagedProcess("desktop", ["-C", "desktop", "dev"]);
} catch (error) {
  const message = error instanceof Error ? error.message : "Desktop dev startup failed.";
  await shutdown(1, message);
}

function startManagedProcess(label, args, envOverrides = {}) {
  const child = spawn(pnpmCommand, args, {
    cwd: repoRoot,
    detached: processGroupSignalsSupported,
    env: {
      ...process.env,
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const managedChild = { label, child };
  managedChildren.push(managedChild);

  pipeOutput(child.stdout, label, process.stdout);
  pipeOutput(child.stderr, label, process.stderr);

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = label === "desktop" ? normalizeExitCode(code, signal) : 1;
    const detail =
      label === "desktop"
        ? `desktop exited (${formatExit(code, signal)})`
        : `${label} exited unexpectedly (${formatExit(code, signal)})`;
    void shutdown(exitCode, detail);
  });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    void shutdown(1, `${label} failed to start: ${error.message}`);
  });

  return managedChild;
}

async function shutdown(exitCode, reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  if (reason) {
    logSummary(reason);
  }

  for (const managedChild of managedChildren) {
    terminateProcessGroup(managedChild.child, "SIGTERM");
  }

  await sleep(300);

  for (const managedChild of managedChildren) {
    terminateProcessGroup(managedChild.child, "SIGKILL");
  }

  process.exit(exitCode);
}

function terminateProcessGroup(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    if (processGroupSignalsSupported && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }
  } catch {
    // Fall back to child.kill below.
  }

  try {
    child.kill(signal);
  } catch {
    // Ignore shutdown races.
  }
}

function pipeOutput(stream, label, writer) {
  if (!stream) {
    return;
  }

  let buffered = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      writer.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffered) {
      writer.write(`[${label}] ${buffered}\n`);
      buffered = "";
    }
  });
}

function logSummary(message) {
  process.stdout.write(`[dev:full] ${message}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeExitCode(code, signal) {
  if (typeof code === "number") {
    return code;
  }

  return signal ? 128 : 0;
}

function formatExit(code, signal) {
  if (typeof code === "number") {
    return `code ${code}`;
  }

  return signal ? `signal ${signal}` : "no exit code";
}
