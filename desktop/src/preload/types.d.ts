declare global {
  interface Window {
    sense1Desktop: import("../main/contracts").DesktopBridge;
  }
}

export {};
