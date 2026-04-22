import type {
  DesktopThreadChangeGroup,
  DesktopThreadEntry,
  DesktopThreadReviewSummary,
  DesktopThreadSnapshot,
} from "../../../main/contracts";

type ChangedFileEntry = readonly [filePath: string, action: string | null];

type BuildRightRailChangedFilesArgs = {
  artifactRoots: string[];
  extractArtifactPathsFromText: (text: string, workspaceRoot: string | null) => string[];
  isVisibleRightRailArtifactPath: (filePath: string, workspaceRoots: string[] | string | null | undefined) => boolean;
  persistedSessionWrittenPaths: string[];
  rightRailChangeGroups: DesktopThreadChangeGroup[];
  reviewSummary: DesktopThreadReviewSummary | null;
  selectedThreadEntries: DesktopThreadEntry[];
  selectedThreadState: DesktopThreadSnapshot["state"] | null;
  transcriptWorkspaceRoot: string | null;
};

type TranscriptArtifactCacheEntry = {
  artifactPaths: string[];
  workspaceRoot: string;
};

const transcriptArtifactCache = new WeakMap<DesktopThreadEntry[], TranscriptArtifactCacheEntry>();

function isLiveThread(threadState: DesktopThreadSnapshot["state"] | null): boolean {
  return threadState === "active" || threadState === "running";
}

function collectTranscriptArtifacts(
  entries: DesktopThreadEntry[],
  workspaceRoot: string | null,
  extractArtifactPathsFromText: BuildRightRailChangedFilesArgs["extractArtifactPathsFromText"],
): string[] {
  if (!workspaceRoot) {
    return [];
  }

  const cachedEntry = transcriptArtifactCache.get(entries);
  if (cachedEntry?.workspaceRoot === workspaceRoot) {
    return cachedEntry.artifactPaths;
  }

  const artifactPaths = entries.flatMap((entry) => {
    if (!("body" in entry) || typeof entry.body !== "string") {
      return [];
    }

    return extractArtifactPathsFromText(entry.body, workspaceRoot);
  });

  transcriptArtifactCache.set(entries, {
    artifactPaths,
    workspaceRoot,
  });

  return artifactPaths;
}

export function buildRightRailChangedFiles({
  artifactRoots,
  extractArtifactPathsFromText,
  isVisibleRightRailArtifactPath,
  persistedSessionWrittenPaths,
  rightRailChangeGroups,
  reviewSummary,
  selectedThreadEntries,
  selectedThreadState,
  transcriptWorkspaceRoot,
}: BuildRightRailChangedFilesArgs): ChangedFileEntry[] {
  const changedFileMap = new Map<string, string | null>();
  const persistedChangedFiles = persistedSessionWrittenPaths.map((filePath) => [filePath, null] as const);
  const changeGroupFiles = rightRailChangeGroups.flatMap((group) => group.files);
  const reviewArtifacts = reviewSummary?.changedArtifacts ?? [];
  const reviewOutputArtifacts = reviewSummary?.outputArtifacts ?? [];
  const reviewCreatedFiles = reviewSummary?.createdFiles ?? [];

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

  if (changedFileMap.size === 0 && !isLiveThread(selectedThreadState)) {
    for (const filePath of collectTranscriptArtifacts(selectedThreadEntries, transcriptWorkspaceRoot, extractArtifactPathsFromText)) {
      if (!changedFileMap.has(filePath)) {
        changedFileMap.set(filePath, "created");
      }
    }
  }

  return Array.from(changedFileMap.entries()).filter(([filePath]) =>
    isVisibleRightRailArtifactPath(filePath, artifactRoots),
  );
}
