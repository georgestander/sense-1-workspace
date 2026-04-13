export interface WorkspaceFolderRecentsLogger {
  warn?: (message: string) => void;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function rememberWorkspaceFolderSelection(
  folderPath: string,
  rememberWorkspaceFolder: ((folderPath: string) => Promise<void>) | undefined,
  logger: WorkspaceFolderRecentsLogger = console,
): Promise<void> {
  if (typeof rememberWorkspaceFolder !== "function") {
    return;
  }

  try {
    await rememberWorkspaceFolder(folderPath);
  } catch (error) {
    logger.warn?.(
      `[desktop:workspace] Failed to save recent folder "${folderPath}": ${formatError(error)}`,
    );
  }
}
