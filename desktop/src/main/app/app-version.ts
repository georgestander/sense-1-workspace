import fs from "node:fs";
import { fileURLToPath } from "node:url";

type PackageMetadata = {
  name?: unknown;
  version?: unknown;
};

const PACKAGE_PATH_CANDIDATES = [
  "../../../package.json",
  "../../package.json",
] as const;

function readPackageMetadata(packagePath: string): PackageMetadata | null {
  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageMetadata;
  } catch {
    return null;
  }
}

export function resolveDesktopAppVersion(moduleUrl: string): string {
  for (const candidate of PACKAGE_PATH_CANDIDATES) {
    const packagePath = fileURLToPath(new URL(candidate, moduleUrl));
    const packageMetadata = readPackageMetadata(packagePath);
    if (packageMetadata?.name !== "sense-1" && packageMetadata?.name !== "sense-1-workspace") {
      continue;
    }
    if (typeof packageMetadata.version === "string" && packageMetadata.version.trim()) {
      return packageMetadata.version.trim();
    }
  }

  return "unknown";
}

export const DESKTOP_APP_VERSION = resolveDesktopAppVersion(import.meta.url);
