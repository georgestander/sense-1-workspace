import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DESKTOP_APP_VERSION, resolveDesktopAppVersion } from "./app-version.ts";

const expectedVersion = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
).version;

test("resolveDesktopAppVersion reads the desktop package version from source paths", () => {
  const sourceModuleUrl = pathToFileURL(path.join(process.cwd(), "src/main/app/app-version.ts")).href;

  assert.equal(resolveDesktopAppVersion(sourceModuleUrl), expectedVersion);
});

test("resolveDesktopAppVersion reads the desktop package version from bundled main paths", () => {
  const bundledModuleUrl = pathToFileURL(path.join(process.cwd(), "dist/main/main.js")).href;

  assert.equal(resolveDesktopAppVersion(bundledModuleUrl), expectedVersion);
});

test("DESKTOP_APP_VERSION stays aligned with the desktop package version", () => {
  assert.equal(DESKTOP_APP_VERSION, expectedVersion);
});
