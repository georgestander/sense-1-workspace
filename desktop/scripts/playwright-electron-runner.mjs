import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { _electron as electron } from "@playwright/test";

const DESKTOP_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_ENTRY = path.join(DESKTOP_ROOT, "dist", "main", "main.js");

function parseArgs(argv) {
  const options = {
    entry: DEFAULT_ENTRY,
    profile: "e2e-test",
    modulePath: null,
    keepOpen: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--entry") {
      options.entry = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      options.profile = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--module") {
      options.modulePath = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--keep-open") {
      options.keepOpen = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function loadScenario(modulePath) {
  if (!modulePath) {
    return null;
  }

  const loaded = await import(pathToFileURL(modulePath).href);
  if (typeof loaded.default !== "function") {
    throw new Error(`Scenario module must export a default async function: ${modulePath}`);
  }
  return loaded.default;
}

async function waitForSignal() {
  await new Promise((resolve) => {
    const onSignal = () => {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const scenario = await loadScenario(options.modulePath);

  const app = await electron.launch({
    args: [options.entry],
    env: {
      ...process.env,
      NODE_ENV: "test",
      SENSE1_PROFILE_ID: options.profile,
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  console.log(
    JSON.stringify({
      entry: options.entry,
      profile: options.profile,
      title: await window.title(),
      url: window.url(),
    }),
  );

  if (scenario) {
    await scenario({ app, window });
  }

  if (options.keepOpen) {
    console.error("Playwright Electron runner is holding the app open. Press Ctrl+C to exit.");
    await waitForSignal();
  }

  await app.close();
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
