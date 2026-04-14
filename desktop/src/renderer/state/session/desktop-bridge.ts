import type { DesktopBridge } from "../../../main/contracts";

export const DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE = "Desktop runtime bridge is not available in this window.";

export function getDesktopBridge(): DesktopBridge | null {
  const bridge = window.sense1Desktop as Partial<DesktopBridge> | undefined;
  if (!bridge) {
    return null;
  }

  if (
    typeof bridge.runtime?.getInfo !== "function" ||
    typeof bridge.updates?.getState !== "function" ||
    typeof bridge.updates?.check !== "function" ||
    typeof bridge.updates?.install !== "function" ||
    typeof bridge.session?.get !== "function" ||
    typeof bridge.session?.subscribe !== "function" ||
    typeof bridge.auth?.launchChatgptSignIn !== "function" ||
    typeof bridge.auth?.logoutChatgpt !== "function" ||
    typeof bridge.profiles?.select !== "function" ||
    typeof bridge.threads?.rememberLastSelected !== "function" ||
    typeof bridge.threads?.rename !== "function" ||
    typeof bridge.threads?.archive !== "function" ||
    typeof bridge.threads?.restore !== "function" ||
    typeof bridge.threads?.delete !== "function" ||
    typeof bridge.threads?.onDelta !== "function" ||
    typeof bridge.turns?.run !== "function" ||
    typeof bridge.turns?.interrupt !== "function" ||
    typeof bridge.turns?.steer !== "function" ||
    typeof bridge.turns?.queue !== "function" ||
    typeof bridge.approvals?.respond !== "function" ||
    typeof bridge.input?.respond !== "function" ||
    typeof bridge.voice?.start !== "function" ||
    typeof bridge.voice?.appendAudio !== "function" ||
    typeof bridge.voice?.stop !== "function" ||
    typeof bridge.models?.list !== "function" ||
    typeof bridge.workspace?.pickFolder !== "function" ||
    typeof bridge.workspace?.pickFiles !== "function" ||
    typeof bridge.workspace?.archive !== "function" ||
    typeof bridge.workspace?.restore !== "function" ||
    typeof bridge.workspace?.delete !== "function" ||
    typeof bridge.workspace?.setOperatingMode !== "function" ||
    typeof bridge.workspace?.rememberThreadRoot !== "function" ||
    typeof bridge.workspace?.rememberSidebarOrder !== "function" ||
    typeof bridge.management?.getOverview !== "function" ||
    typeof bridge.management?.setPluginEnabled !== "function" ||
    typeof bridge.management?.setAppEnabled !== "function" ||
    typeof bridge.management?.setMcpServerEnabled !== "function" ||
    typeof bridge.management?.setSkillEnabled !== "function" ||
    typeof bridge.team?.getState !== "function" ||
    typeof bridge.team?.createFirstTeam !== "function" ||
    typeof bridge.team?.saveMember !== "function" ||
    typeof bridge.automations?.list !== "function" ||
    typeof bridge.automations?.get !== "function" ||
    typeof bridge.automations?.save !== "function" ||
    typeof bridge.automations?.delete !== "function" ||
    typeof bridge.automations?.runNow !== "function"
  ) {
    return null;
  }

  return bridge as DesktopBridge;
}

export function requireDesktopBridge(): DesktopBridge {
  const bridge = getDesktopBridge();
  if (!bridge) {
    throw new Error(DESKTOP_BRIDGE_UNAVAILABLE_MESSAGE);
  }

  return bridge;
}
