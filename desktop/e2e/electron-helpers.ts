import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";

const DESKTOP_ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Launch the Sense-1 Electron app for testing.
 *
 * Requires a prior `pnpm build` so that `dist/main/main.js` exists.
 * The app is launched with an isolated profile to avoid polluting real user state.
 */
export async function launchApp(options: {
  env?: NodeJS.ProcessEnv;
  profileId?: string | null;
} = {}): Promise<{ app: ElectronApplication; window: Page }> {
  const profileId = options.profileId === undefined ? "e2e-test" : options.profileId;
  const app = await electron.launch({
    args: [path.join(DESKTOP_ROOT, "dist/main/main.js")],
    env: {
      ...process.env,
      ...options.env,
      NODE_ENV: "test",
      ...(profileId ? { SENSE1_PROFILE_ID: profileId } : {}),
    },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return { app, window };
}
