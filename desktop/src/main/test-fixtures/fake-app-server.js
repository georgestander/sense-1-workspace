import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const args = new Set(process.argv.slice(2));
const hangInitialize = args.has("--hang-initialize");
const crashAfterInitialize = args.has("--crash-after-initialize");
const reportConfigContext = args.has("--report-config-context");
const reportEnvContext = args.has("--report-env-context");

let initialized = false;

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function send(payload) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...payload })}\n`);
}

function log(line) {
  process.stderr.write(`${line}\n`);
}

rl.on("line", (line) => {
  void handleLine(line).catch((error) => {
    log(`handler failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
});

async function handleLine(line) {
  if (!line.trim()) {
    return;
  }

  const message = JSON.parse(line);

  if (message.method === "initialize") {
    log("initialize received");
    if (hangInitialize) {
      return;
    }

    send({
      id: message.id,
      result: {
        serverInfo: {
          name: "fake-app-server",
          version: "0.0.1",
        },
      },
    });

    if (crashAfterInitialize) {
      setTimeout(() => process.exit(17), 25);
    }
    return;
  }

  if (message.method === "initialized") {
    initialized = true;
    send({
      method: "server/status",
      params: { state: "ready" },
    });
    return;
  }

  if (message.method === "ping") {
    if (!initialized) {
      send({
        id: message.id,
        error: { code: -32000, message: "initialized notification missing" },
      });
      return;
    }

    send({
      id: message.id,
      result: { ok: true, echoed: message.params ?? null },
    });
    return;
  }

  if (message.method === "runtimeContext") {
    const result = {
      codexHome: process.env.CODEX_HOME || null,
      cwd: process.cwd(),
    };

    if (reportConfigContext) {
      result.configContext = await resolveConfigContext();
    }
    if (reportEnvContext) {
      result.environmentContext = resolveEnvironmentContext();
    }

    send({
      id: message.id,
      result,
    });
    return;
  }

  if (message.method === "emitNotification") {
    send({
      method: "thread/item",
      params: message.params ?? {},
    });
    send({
      id: message.id,
      result: { delivered: true },
    });
    return;
  }

  if (message.method === "fs/readDirectory") {
    const rootPath = typeof message.params?.path === "string" ? message.params.path : "";
    send({
      id: message.id,
      result: {
        entries: [
          {
            name: "README.md",
            path: rootPath ? path.join(rootPath, "README.md") : "README.md",
            type: "file",
          },
          {
            name: "src",
            path: rootPath ? path.join(rootPath, "src") : "src",
            type: "directory",
          },
        ],
        path: rootPath || null,
        params: message.params ?? null,
      },
    });
    return;
  }

  if (message.method === "crash") {
    log("intentional crash");
    setTimeout(() => process.exit(23), 10);
    return;
  }

  if (message.id !== undefined) {
    send({
      id: message.id,
      result: { ok: true },
    });
  }
}

function resolveEnvironmentContext() {
  return {
    home: process.env.HOME || null,
    pathEntries: (process.env.PATH || "").split(path.delimiter).filter(Boolean),
    xdgCacheHome: process.env.XDG_CACHE_HOME || null,
    xdgConfigHome: process.env.XDG_CONFIG_HOME || null,
    xdgDataHome: process.env.XDG_DATA_HOME || null,
    xdgStateHome: process.env.XDG_STATE_HOME || null,
  };
}

async function resolveConfigContext() {
  const codexHome = process.env.CODEX_HOME || null;
  const home = process.env.HOME || null;
  const profileConfigPath = codexHome ? path.join(codexHome, "config.toml") : null;
  const globalConfigPath = home ? path.join(home, ".codex", "config.toml") : null;

  if (profileConfigPath && (await fileExists(profileConfigPath))) {
    return {
      contents: await fs.readFile(profileConfigPath, "utf8"),
      path: profileConfigPath,
      source: "profile",
    };
  }

  if (globalConfigPath && (await fileExists(globalConfigPath))) {
    return {
      contents: await fs.readFile(globalConfigPath, "utf8"),
      path: globalConfigPath,
      source: "global",
    };
  }

  return {
    contents: null,
    path: null,
    source: "none",
  };
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
