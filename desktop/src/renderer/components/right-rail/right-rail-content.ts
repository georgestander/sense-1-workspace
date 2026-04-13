import type {
  DesktopThreadChangeGroup,
  DesktopThreadSnapshot,
} from "../../../main/contracts";

type ChangedFileEntry = readonly [filePath: string, action: string | null];

type BuildRightRailChangedFilesArgs = {
  artifactRoots: string[];
  extractArtifactPathsFromText: (text: string, workspaceRoot: string | null) => string[];
  isVisibleRightRailArtifactPath: (filePath: string, workspaceRoots: string[] | string | null | undefined) => boolean;
  persistedSessionWrittenPaths: string[];
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  rightRailThread: DesktopThreadSnapshot | null;
  selectedThread: DesktopThreadSnapshot | null;
};

function isLiveThread(thread: DesktopThreadSnapshot | null): boolean {
  return thread?.state === "active" || thread?.state === "running";
}

function collectTranscriptArtifacts(
  selectedThread: DesktopThreadSnapshot | null,
  extractArtifactPathsFromText: BuildRightRailChangedFilesArgs["extractArtifactPathsFromText"],
): string[] {
  const folderRoot = selectedThread?.workspaceRoot ?? selectedThread?.cwd ?? null;
  if (!selectedThread || !folderRoot) {
    return [];
  }

  return selectedThread.entries.flatMap((entry) => {
    if (!("body" in entry) || typeof entry.body !== "string") {
      return [];
    }

    return extractArtifactPathsFromText(entry.body, folderRoot);
  });
}

export function buildRightRailChangedFiles({
  artifactRoots,
  extractArtifactPathsFromText,
  isVisibleRightRailArtifactPath,
  persistedSessionWrittenPaths,
  rightRailChangeGroups,
  rightRailThread,
  selectedThread,
}: BuildRightRailChangedFilesArgs): ChangedFileEntry[] {
  const changedFileMap = new Map<string, string | null>();
  const persistedChangedFiles = persistedSessionWrittenPaths.map((filePath) => [filePath, null] as const);
  const changeGroupFiles = rightRailChangeGroups.flatMap((group) => group.files);
  const reviewArtifacts = rightRailThread?.reviewSummary?.changedArtifacts ?? [];
  const reviewOutputArtifacts = rightRailThread?.reviewSummary?.outputArtifacts ?? [];
  const reviewCreatedFiles = rightRailThread?.reviewSummary?.createdFiles ?? [];

  for (const [filePath, action] of persistedChangedFiles) {
    if (!changedFileMap.has(filePath)) {
      changedFileMap.set(filePath, action);
    }
  }
  for (const filePath of changeGroupFiles) {
    if (!changedFileMap.has(filePath)) {
      changedFileMap.set(filePath, null);
    }
  }
  for (const artifact of [...reviewArtifacts, ...reviewOutputArtifacts, ...reviewCreatedFiles]) {
    if (artifact.path && !changedFileMap.has(artifact.path)) {
      changedFileMap.set(artifact.path, artifact.action);
    } else if (artifact.path && artifact.action) {
      changedFileMap.set(artifact.path, artifact.action);
    }
  }

  if (changedFileMap.size === 0 && !isLiveThread(selectedThread)) {
    for (const filePath of collectTranscriptArtifacts(selectedThread, extractArtifactPathsFromText)) {
      if (!changedFileMap.has(filePath)) {
        changedFileMap.set(filePath, "created");
      }
    }
  }

  return Array.from(changedFileMap.entries()).filter(([filePath]) =>
    isVisibleRightRailArtifactPath(filePath, artifactRoots),
  );
}
