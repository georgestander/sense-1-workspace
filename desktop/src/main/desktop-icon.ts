import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_ICON_CANDIDATES = [
  resolve(process.resourcesPath, "resources", "icon-1024.png"),
  resolve(process.cwd(), "resources", "icon-1024.png"),
  fileURLToPath(new URL("../../resources/icon-1024.png", import.meta.url)),
];

export function resolveDesktopIconPath(): string | null {
  return DESKTOP_ICON_CANDIDATES.find((candidate) => existsSync(candidate)) ?? null;
}

export function resolveDesktopIconDataUrl(): string | null {
  const iconPath = resolveDesktopIconPath();
  if (!iconPath) {
    return null;
  }

  try {
    return `data:image/png;base64,${readFileSync(iconPath).toString("base64")}`;
  } catch {
    return null;
  }
}
