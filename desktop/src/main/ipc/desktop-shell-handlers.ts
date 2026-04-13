import path from "node:path";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import { rememberWorkspaceFolderSelection } from "../workspace/workspace-folder-recents.ts";
import type {
  DesktopWorkspaceArchiveRequest,
  DesktopWorkspaceDeleteRequest,
  DesktopWorkspaceHydrateResult,
  DesktopWorkspaceOperatingModeRequest,
  DesktopWorkspacePermissionGrantRequest,
  DesktopWorkspacePolicyRequest,
  DesktopWorkspacePolicyResult,
  DesktopWorkspaceRestoreRequest,
  FilePickerResult,
  WindowActionResult,
  WindowToggleResult,
  WorkspaceFolderPickerResult,
} from "../../shared/contracts/index";
import { IPC_CHANNELS } from "../../shared/contracts/index";
import { getMainWindow } from "../window";

type DesktopShellServices = {
  rememberWorkspaceFolder(folderPath: string): Promise<void>;
  archiveWorkspace(request: DesktopWorkspaceArchiveRequest): Promise<void>;
  restoreWorkspace(request: DesktopWorkspaceRestoreRequest): Promise<void>;
  deleteWorkspace(request: DesktopWorkspaceDeleteRequest): Promise<void>;
  getWorkspacePolicy(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspacePolicyResult>;
  hydrateWorkspace(request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspaceHydrateResult>;
  grantWorkspacePermission(request: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult>;
  setWorkspaceOperatingMode(request: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult>;
};

function resolveE2EWorkspaceFolderPickerResult(env: NodeJS.ProcessEnv = process.env): WorkspaceFolderPickerResult | null {
  if (env.NODE_ENV !== "test") {
    return null;
  }

  if (env.SENSE1_E2E_PICK_FOLDER_CANCEL === "1") {
    return {
      canceled: true,
      path: null,
    };
  }

  const fixturePath = env.SENSE1_E2E_PICK_FOLDER_PATH?.trim();
  if (!fixturePath) {
    return null;
  }

  return {
    canceled: false,
    path: path.resolve(fixturePath),
  };
}

function windowActionResult(windowFactory: () => BrowserWindow | null, action: (window: BrowserWindow) => void): WindowActionResult {
  const window = windowFactory();

  if (!window) {
    return {
      success: false,
      reason: "Main window is not available. Create it first via app bootstrap.",
    };
  }

  action(window);

  return {
    success: true,
  };
}

export function registerDesktopShellHandlers(services: DesktopShellServices): void {
  ipcMain.handle(
    IPC_CHANNELS.pickWorkspaceFolder,
    async (): Promise<WorkspaceFolderPickerResult> => {
      const fixtureResult = resolveE2EWorkspaceFolderPickerResult();
      if (fixtureResult) {
        if (!fixtureResult.canceled && fixtureResult.path) {
          await rememberWorkspaceFolderSelection(fixtureResult.path, services.rememberWorkspaceFolder);
        }
        return fixtureResult;
      }

      const options = {
        properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
        title: "Choose a workspace folder",
      };
      const window = getMainWindow();
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);

      const selectedPath = result.filePaths[0]?.trim();
      if (result.canceled || !selectedPath) {
        return {
          canceled: true,
          path: null,
        };
      }

      await rememberWorkspaceFolderSelection(selectedPath, services.rememberWorkspaceFolder);
      return {
        canceled: false,
        path: selectedPath,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.archiveWorkspace,
    async (_event, request: DesktopWorkspaceArchiveRequest): Promise<void> => {
      await services.archiveWorkspace(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.restoreWorkspace,
    async (_event, request: DesktopWorkspaceRestoreRequest): Promise<void> => {
      await services.restoreWorkspace(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.deleteWorkspace,
    async (_event, request: DesktopWorkspaceDeleteRequest): Promise<void> => {
      await services.deleteWorkspace(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.pickFiles,
    async (): Promise<FilePickerResult> => {
      const options = {
        properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
        title: "Choose files to attach",
      };
      const window = getMainWindow();
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return {
          canceled: true,
          paths: [],
        };
      }

      return {
        canceled: false,
        paths: result.filePaths,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.getWorkspacePolicy,
    async (_event, request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspacePolicyResult> => {
      return await services.getWorkspacePolicy(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.hydrateWorkspace,
    async (_event, request: DesktopWorkspacePolicyRequest): Promise<DesktopWorkspaceHydrateResult> => {
      return await services.hydrateWorkspace(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.grantWorkspacePermission,
    async (_event, request: DesktopWorkspacePermissionGrantRequest): Promise<DesktopWorkspacePolicyResult> => {
      return await services.grantWorkspacePermission(request);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.setWorkspaceOperatingMode,
    async (_event, request: DesktopWorkspaceOperatingModeRequest): Promise<DesktopWorkspacePolicyResult> => {
      return await services.setWorkspaceOperatingMode(request);
    },
  );

  ipcMain.handle(IPC_CHANNELS.windowMinimize, (): WindowActionResult => {
    return windowActionResult(() => getMainWindow(), (window) => {
      window.minimize();
    });
  });

  ipcMain.handle(IPC_CHANNELS.windowToggleMaximize, (): WindowToggleResult => {
    const window = getMainWindow();

    if (!window) {
      return {
        success: false,
        isMaximized: false,
        reason: "Main window is not available. Create it first via app bootstrap.",
      };
    }

    if (window.isMaximized()) {
      window.restore();
    } else {
      window.maximize();
    }

    return {
      success: true,
      isMaximized: window.isMaximized(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.windowClose, (): WindowActionResult => {
    return windowActionResult(() => getMainWindow(), (window) => {
      window.close();
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.openExternalUrl,
    async (_event: unknown, url: string): Promise<{ success: boolean; error?: string }> => {
      if (typeof url !== "string" || !url.trim()) {
        return { success: false, error: "No URL provided." };
      }

      try {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { success: false, error: `Unsupported URL protocol: ${parsed.protocol}` };
        }
        await shell.openExternal(parsed.href);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to open external URL.",
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.openFilePath, async (_event: unknown, filePath: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof filePath !== "string" || !filePath.trim()) {
      return { success: false, error: "No file path provided." };
    }

    const resolved = path.resolve(filePath.trim());
    try {
      const openPathResult = await shell.openPath(resolved);
      if (!openPathResult) {
        return { success: true };
      }
    } catch {
      // Fall through to shell.openExternal.
    }

    try {
      const fileUrl = new URL(`file://${resolved}`).href;
      await shell.openExternal(fileUrl);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Failed to open file." };
    }
  });
}
