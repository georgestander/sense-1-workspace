import { useEffect, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type {
  DesktopBootstrapTeamSetup,
  DesktopBootstrapTenant,
  DesktopTeamStateResult,
} from "../../../main/contracts";

function sanitizeTeamErrorMessage(message: string): string {
  return message
    .replace(/^Error invoking remote method '.*?':\s*/u, "")
    .replace(/^Error:\s*/u, "")
    .trim();
}

function TeamCard({
  title,
  body,
  detail,
}: {
  title: string;
  body: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.85rem]">
      <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">{title}</p>
      <p className="mt-[0.35rem] text-[0.9375rem] leading-[1.55] text-ink">{body}</p>
      {detail ? <p className="mt-[0.35rem] text-[0.8125rem] leading-[1.52] text-ink-muted">{detail}</p> : null}
    </div>
  );
}

export function TeamSettingsSection({
  accountEmail,
  teamSetup,
  tenant,
  refreshBootstrap,
}: {
  accountEmail: string | null;
  teamSetup: DesktopBootstrapTeamSetup;
  tenant: DesktopBootstrapTenant | null;
  refreshBootstrap: () => Promise<unknown>;
}) {
  const [teamState, setTeamState] = useState<DesktopTeamStateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");

  useEffect(() => {
    let cancelled = false;
    const bridge = window.sense1Desktop;

    async function loadTeamState(): Promise<void> {
      if (!bridge?.team?.getState) {
        if (!cancelled) {
          setTeamState(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const result = await bridge.team.getState();
        if (!cancelled) {
          setTeamState(result);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(sanitizeTeamErrorMessage(nextError instanceof Error ? nextError.message : "Could not load team state."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadTeamState();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateFirstTeam(): Promise<void> {
    const bridge = window.sense1Desktop;
    if (!bridge?.team?.createFirstTeam) {
      setError("Desktop team setup is not available in this build.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await bridge.team.createFirstTeam({ name: teamName });
      setTeamState(result);
      setTeamName("");
      await refreshBootstrap();
    } catch (nextError) {
      setError(sanitizeTeamErrorMessage(nextError instanceof Error ? nextError.message : "Could not create the first team."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMember(): Promise<void> {
    const bridge = window.sense1Desktop;
    if (!bridge?.team?.saveMember) {
      setError("Desktop team membership editing is not available in this build.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await bridge.team.saveMember({
        email: memberEmail,
        role: memberRole,
      });
      setTeamState(result);
      setMemberEmail("");
      setMemberRole("member");
      await refreshBootstrap();
    } catch (nextError) {
      setError(sanitizeTeamErrorMessage(nextError instanceof Error ? nextError.message : "Could not save the team member."));
    } finally {
      setSaving(false);
    }
  }

  const effectiveTeamState = teamState ?? {
    accountEmail,
    teamSetup,
    tenant,
    members: [],
  };

  return (
    <>
      <h2 className="font-display text-[1.25rem] font-semibold leading-[1.35] tracking-[-0.015em]">Team</h2>
      <p className="mt-[0.2rem] text-[0.875rem] leading-[1.6] text-ink-muted">
        Local mode works immediately on this Mac. Hosted invites and alpha downloads now live in the web portal, while this desktop team section remains a transitional local-only scaffold.
      </p>

      {loading ? (
        <p className="mt-[1.25rem] text-[0.875rem] leading-[1.6] text-ink-muted">Loading team setup...</p>
      ) : (
        <div className="mt-[1.25rem] flex flex-col gap-[1rem]">
          <TeamCard
            title={effectiveTeamState.tenant ? "Active team" : "Current mode"}
            body={
              effectiveTeamState.tenant
                ? `${effectiveTeamState.tenant.displayName} is active for ${effectiveTeamState.accountEmail ?? "this profile"}.`
                : `Sense-1 is in local mode for ${effectiveTeamState.accountEmail ?? "this profile"}.`
            }
            detail={
              effectiveTeamState.tenant
                ? `${effectiveTeamState.tenant.role === "admin" ? "Admin" : "Member"} scope • ${effectiveTeamState.tenant.scopeDisplayName}`
                : "Chats and folder work stay on this Mac until you create or join a team."
            }
          />

          {!effectiveTeamState.tenant && effectiveTeamState.teamSetup.canCreateFirstTeam ? (
            <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.85rem]">
              <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Create your first team</p>
              <p className="mt-[0.35rem] text-[0.9375rem] leading-[1.55] text-ink">
                Create a desktop-local team record and make this account the initial admin.
              </p>
              <p className="mt-[0.35rem] text-[0.8125rem] leading-[1.52] text-ink-muted">
                This only establishes a local desktop team identity. Hosted invites and per-user download access are managed in the web portal.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  disabled={saving}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="e.g. Sense-1"
                  value={teamName}
                />
                <Button
                  disabled={saving || !teamName.trim()}
                  onClick={() => void handleCreateFirstTeam()}
                >
                  {saving ? "Creating..." : "Create team"}
                </Button>
              </div>
            </div>
          ) : null}

          {effectiveTeamState.tenant ? (
            <>
              <TeamCard
                title="Membership model"
                body={`${effectiveTeamState.members.length} member${effectiveTeamState.members.length === 1 ? " is" : "s are"} currently stored for ${effectiveTeamState.tenant.displayName}.`}
                detail="These memberships are desktop-local for now. The hosted portal owns invited-user access and alpha build downloads."
              />

              {effectiveTeamState.teamSetup.canManageTeam ? (
                <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.85rem]">
                  <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Add member</p>
                  <p className="mt-[0.35rem] text-[0.9375rem] leading-[1.55] text-ink">
                    Add or update a local member record for this team on this machine.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      disabled={saving}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="name@example.com"
                      value={memberEmail}
                    />
                    <select
                      className="rounded-md bg-white px-[0.65rem] py-[0.4rem] text-[0.875rem] leading-[1.6] text-ink outline-none focus:ring-1 focus:ring-line"
                      disabled={saving}
                      onChange={(event) => setMemberRole(event.target.value === "admin" ? "admin" : "member")}
                      value={memberRole}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button
                      disabled={saving || !memberEmail.trim()}
                      onClick={() => void handleSaveMember()}
                    >
                      {saving ? "Saving..." : "Save member"}
                    </Button>
                  </div>
                </div>
              ) : (
                <TeamCard
                  title="Role"
                  body="This account can use the active team but cannot edit membership."
                  detail="Ask an existing admin to manage local team membership from their desktop session."
                />
              )}

              {effectiveTeamState.members.length > 0 ? (
                <div className="rounded-xl bg-surface-low px-[0.9rem] py-[0.85rem]">
                  <p className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">Members</p>
                  <div className="mt-3 flex flex-col gap-2">
                    {effectiveTeamState.members.map((member) => (
                      <div className="rounded-lg bg-white px-3 py-2" key={`${member.tenantId}:${member.email}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{member.actorDisplayName}</p>
                            <p className="truncate text-xs text-ink-muted">{member.email}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface-low px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-ink-faint">
                            {member.role}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? <p className="text-[0.8125rem] leading-[1.52] text-[oklch(65%_0.15_25)]">{error}</p> : null}
        </div>
      )}
    </>
  );
}
