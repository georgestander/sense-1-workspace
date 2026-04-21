import { useEffect, useState } from "react";

import type { DesktopPolicyRuleGroup } from "../../../main/contracts";

const DUPLICATE_POLICY_GROUPS = new Set(["identity-personality", "permissions-approvals", "planning"]);

type BehaviorSettingsSectionProps = {
  settingsOpen: boolean;
  settingsSection: string;
};

export function BehaviorSettingsSection({
  settingsOpen,
  settingsSection,
}: BehaviorSettingsSectionProps) {
  const [policyRules, setPolicyRules] = useState<DesktopPolicyRuleGroup[] | null>(null);

  useEffect(() => {
    if (!settingsOpen || settingsSection !== "behavior") {
      setPolicyRules(null);
      return;
    }

    let cancelled = false;
    window.sense1Desktop?.settings.getPolicyRules().then((result: { groups: DesktopPolicyRuleGroup[] }) => {
      if (!cancelled) {
        setPolicyRules(result.groups.filter((group) => !DUPLICATE_POLICY_GROUPS.has(group.id)));
      }
    }).catch(() => {
      if (!cancelled) {
        setPolicyRules([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settingsOpen, settingsSection]);

  return (
    <>
      <h2 className="font-display text-[1.05rem] font-semibold leading-[1.35] tracking-[-0.015em]">Agent behavior</h2>
      <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.55] text-ink-muted">
        Built-in rules that govern how Sense-1 handles files, workspaces, and conversations.
      </p>
      {policyRules ? (
        policyRules.length > 0 ? (
          <div className="mt-[0.75rem] flex flex-col gap-[0.75rem]">
            {policyRules.map((group) => (
              <div className="rounded-lg bg-surface-low px-[0.9rem] py-[0.65rem]" key={group.id}>
                <h3 className="font-display text-[1.1rem] font-semibold leading-[1.4] tracking-[-0.01em]">{group.topic}</h3>
                <div className="mt-[0.65rem] flex flex-col gap-[0.65rem]">
                  {group.rules.map((rule) => (
                    <div key={rule.id}>
                      <div className="flex items-baseline gap-[0.4rem]">
                        <span className="text-[0.75rem] font-medium uppercase leading-[1.2] tracking-[0.05em] text-ink-faint">{rule.label}</span>
                        {rule.currentValue ? (
                          <span className="text-[0.75rem] leading-[1.2] text-accent">{rule.currentValue}</span>
                        ) : null}
                      </div>
                      <p className="mt-[0.1rem] text-[0.8125rem] leading-[1.55] text-ink-faint">{rule.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[0.8125rem] leading-[1.52] text-ink-muted">
              This section reflects the desktop runtime contract as it exists today.
            </p>
          </div>
        ) : (
          <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Could not load agent behavior rules.</p>
        )
      ) : (
        <p className="mt-[0.75rem] text-[0.8125rem] leading-[1.55] text-ink-muted">Loading rules...</p>
      )}
    </>
  );
}
