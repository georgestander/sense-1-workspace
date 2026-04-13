import { test, expect } from "@playwright/test";
import { launchApp } from "./electron-helpers";
import type { ElectronApplication, Page } from "@playwright/test";

let app: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  ({ app, window } = await launchApp());
});

test.afterAll(async () => {
  await app?.close();
});

test("app window opens", async () => {
  expect(window).toBeTruthy();
  const title = await window.title();
  expect(title).toBeTruthy();
});

test("window is visible and has reasonable dimensions", async () => {
  const { width, height } = await window.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(width).toBeGreaterThan(400);
  expect(height).toBeGreaterThan(300);
});

test("renderer loads without crash", async () => {
  // Check that the React root mounted — the renderer should have a #root element
  const root = await window.locator("#root");
  await expect(root).toBeAttached({ timeout: 10_000 });
});
