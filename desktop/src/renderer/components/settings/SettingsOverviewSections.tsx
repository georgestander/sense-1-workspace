import { useEffect, useMemo, useState } from "react";

import type {
  DesktopAutomationRecord,
  DesktopExtensionOverviewResult,
  SubstrateSessionRecord,
  SubstrateWorkspaceRecord,
} from "../../../main/contracts";

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <h2 className="font-display text-[1.05rem] font-semibold leading-[1.35] tracking-[-0.015em]">{title}</h2>
      <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.55] text-ink-muted">{description}</p>
    </>
  );
}

function InfoCard({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.55rem]">
      <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">{title}</p>
      <p className="mt-[0.25rem] text-[0.875rem] leading-[1.5] text-ink">{body}</p>
      {detail ? (
        <p className="mt-[0.2rem] text-[0.8125rem] leading-[1.5] text-ink-muted">{detail}</p>
      ) : null}
    </div>
  );
}

function useManagementOverview() {
  const [overview, setOverview] = useState<DesktopExtensionOverviewResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.sense1Desktop;
    if (!bridge?.management?.getOverview) {
      return;
    }

    bridge.management.getOverview({ forceRefetch: false }).then((result) => {
      if (!cancelled) {
        setOverview(result);
      }
    }).catch(() => {
      if (!cancelled) {
        setOverview(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return overview;
}

function useAutomationRecords() {
  const [records, setRecords] = useState<DesktopAutomationRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.sense1Desktop;
    if (!bridge?.automations?.list) {
      return;
    }

    bridge.automations.list().then((result) => {
      if (!cancelled) {
        setRecords(result.automations);
      }
    }).catch(() => {
      if (!cancelled) {
        setRecords([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return records;
}

function useSubstrateSnapshot() {
  const [snapshot, setSnapshot] = useState<{
    sessions: SubstrateSessionRecord[];
    workspaces: SubstrateWorkspaceRecord[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.sense1Desktop;
    if (!bridge?.substrate?.recentSessions || !bridge?.substrate?.recentWorkspaces) {
      return;
    }

    Promise.all([
      bridge.substrate.recentSessions({ limit: 100 }),
      bridge.substrate.recentWorkspaces({ limit: 100 }),
    ]).then(([sessionsResult, workspacesResult]) => {
      if (!cancelled) {
        setSnapshot({
          sessions: sessionsResult.sessions,
          workspaces: workspacesResult.workspaces,
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setSnapshot({
          sessions: [],
          workspaces: [],
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return snapshot;
}

export function McpServersSettingsSection() {
  const overview = useManagementOverview();

  return (
    <>
      <SectionIntro
        description="See the MCP servers Sense-1 can currently discover for this profile."
        title="MCP Servers"
      />
      {overview ? (
        <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
          <InfoCard
            title="Current provider"
            body={overview.provider.selectedProvider ? `${overview.provider.selectedProvider} is currently selected.` : "No provider is configured yet."}
            detail={overview.provider.authMode ? `Auth mode: ${overview.provider.authMode}` : "Auth mode is not available yet."}
          />
          {overview.mcpServers.length > 0 ? overview.mcpServers.map((server) => (
            <InfoCard
              body={`${server.enabled ? "Enabled" : "Disabled"}${server.state ? ` • ${server.state}` : ""}`}
              detail={`Tools: ${server.toolsCount} • Resources: ${server.resourcesCount}${server.command ? ` • ${server.command}` : server.url ? ` • ${server.url}` : ""}`}
              key={server.id}
              title={server.id}
            />
          )) : (
            <InfoCard
              title="No MCP servers discovered"
              body="This profile does not currently expose any MCP server status entries."
              detail="Use the Plugins page when you want to add or toggle server-backed integrations."
            />
          )}
        </div>
      ) : (
        <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Loading MCP servers...</p>
      )}
    </>
  );
}

export function GitSettingsSection() {
  const snapshot = useSubstrateSnapshot();
  const recentRoots = useMemo(
    () => (snapshot?.workspaces ?? []).slice(0, 5).map((workspace) => workspace.root_path),
    [snapshot],
  );

  return (
    <>
      <SectionIntro
        description="Git behavior in desktop v1 stays folder-bound and intentionally quiet."
        title="Git"
      />
      <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
        <InfoCard
          title="How git runs here"
          body="Sense-1 executes git work inside the folder or worktree you attached to the thread."
          detail="The desktop shell does not add a separate git control plane. It keeps the current folder as the source of truth."
        />
        <InfoCard
          title="Recent folder roots"
          body={recentRoots.length > 0 ? `${recentRoots.length} recent folder roots are available from substrate.` : "No recent folder roots are available yet."}
          detail={recentRoots.length > 0 ? recentRoots.join(" • ") : "Open a folder from the start surface to establish recent git/worktree context."}
        />
      </div>
    </>
  );
}

export function EnvironmentsSettingsSection() {
  const automations = useAutomationRecords();
  const localCount = automations?.filter((automation) => automation.executionEnvironment === "local").length ?? 0;
  const worktreeCount = automations?.filter((automation) => automation.executionEnvironment === "worktree").length ?? 0;

  return (
    <>
      <SectionIntro
        description="Desktop environments stay explicit: local runs, worktree runs, and automations that target them."
        title="Environments"
      />
      <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
        <InfoCard
          title="Local environment"
          body="Local runs stay attached to the folder you pick in the desktop app."
          detail="This is the default lane for normal chat sessions and direct workspace work."
        />
        <InfoCard
          title="Automation environments"
          body={automations ? `${localCount} local automation${localCount === 1 ? "" : "s"} and ${worktreeCount} worktree automation${worktreeCount === 1 ? "" : "s"} are configured.` : "Loading automation environments..."}
          detail="Automations surface environment choice explicitly so repeatable work can stay isolated when needed."
        />
      </div>
    </>
  );
}

export function WorktreesSettingsSection() {
  const snapshot = useSubstrateSnapshot();
  const activeWorkspaces = (snapshot?.workspaces ?? []).filter((workspace) => workspace.status === "active");

  return (
    <>
      <SectionIntro
        description="Recent folder roots and worktree-like paths are tracked through the desktop workspace substrate."
        title="Worktrees"
      />
      {snapshot ? (
        <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
          <InfoCard
            title="Active workspace roots"
            body={`${activeWorkspaces.length} active workspace root${activeWorkspaces.length === 1 ? "" : "s"} are currently remembered.`}
            detail={activeWorkspaces.slice(0, 5).map((workspace) => workspace.root_path).join(" • ") || "Pick a folder to start building recent-work context."}
          />
          <InfoCard
            title="Desktop contract"
            body="Worktrees are treated as normal folder roots instead of a special product surface."
            detail="That keeps desktop v1 focused on starting a chat and attaching a local folder quickly."
          />
        </div>
      ) : (
        <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Loading worktree context...</p>
      )}
    </>
  );
}

export function ArchivedChatsSettingsSection() {
  const snapshot = useSubstrateSnapshot();
  const archivedSessions = (snapshot?.sessions ?? []).filter((session) => session.status === "archived");
  const archivedWorkspaces = (snapshot?.workspaces ?? []).filter((workspace) => workspace.status === "archived");

  return (
    <>
      <SectionIntro
        description="Archived conversations and workspaces stay available for restoration without becoming a separate desktop mode."
        title="Archived Chats"
      />
      {snapshot ? (
        <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
          <InfoCard
            title="Archived chats"
            body={`${archivedSessions.length} archived chat${archivedSessions.length === 1 ? "" : "s"} are currently recorded.`}
            detail={archivedSessions.slice(0, 5).map((session) => session.title ?? session.id).join(" • ") || "Archived chats will appear here after you archive them from the sidebar or start surface."}
          />
          <InfoCard
            title="Archived workspaces"
            body={`${archivedWorkspaces.length} archived workspace${archivedWorkspaces.length === 1 ? "" : "s"} are currently recorded.`}
            detail={archivedWorkspaces.slice(0, 5).map((workspace) => workspace.display_name ?? workspace.root_path).join(" • ") || "Archived workspace roots remain restorable from the start surface."}
          />
        </div>
      ) : (
        <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Loading archive state...</p>
      )}
    </>
  );
}
