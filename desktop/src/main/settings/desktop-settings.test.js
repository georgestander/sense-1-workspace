import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DESKTOP_SETTINGS,
  applyDesktopSettingsPatch,
  resolveDesktopSettings,
  resolveDesktopSettingsState,
} from "./desktop-settings.js";

test("resolveDesktopSettings lifts legacy flat settings into effective desktop defaults", () => {
  const settings = resolveDesktopSettings({
    model: "gpt-5.4",
    reasoningEffort: "high",
    serviceTier: "fast",
    personality: "formal",
    approvalPosture: "onRequest",
    sandboxPosture: "readOnly",
  });

  assert.deepEqual(settings, {
    ...resolveDesktopSettings(),
    model: "gpt-5.4",
    reasoningEffort: "high",
    serviceTier: "fast",
    personality: "pragmatic",
    approvalPosture: "onRequest",
    sandboxPosture: "readOnly",
  });
  assert.equal(resolveDesktopSettings().runtimeInstructions, DEFAULT_DESKTOP_SETTINGS.runtimeInstructions);
});

test("resolveDesktopSettingsState layers workspace defaults and model restrictions", () => {
  const state = resolveDesktopSettingsState(
    {
      version: 2,
      policy: {
        system: null,
        organization: {
          modelRestrictions: {
            allowedModels: ["gpt-5.4-mini", "gpt-5.4"],
          },
        },
        profile: {
          workspaceDefaults: {
            model: "gpt-5.4",
            reasoningEffort: "medium",
            serviceTier: "fast",
            personality: "formal",
          },
          approvalDefaults: {
            approvalPosture: "onRequest",
            sandboxPosture: "readOnly",
          },
        },
        workspaces: {
          "/tmp/workspace-a": {
            workspaceDefaults: {
              model: "gpt-5.4-mini",
              personality: "concise",
            },
          },
        },
      },
    },
    "/tmp/workspace-a",
  );

  assert.deepEqual(state.effectiveSettings, {
    ...resolveDesktopSettings(),
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
    serviceTier: "fast",
    personality: "pragmatic",
    approvalPosture: "onRequest",
    sandboxPosture: "readOnly",
  });
  assert.deepEqual(state.modelRestrictions, {
    allowedModels: ["gpt-5.4-mini", "gpt-5.4"],
  });
});

test("applyDesktopSettingsPatch rejects a default model outside allowed restrictions", () => {
  assert.throws(
    () =>
      applyDesktopSettingsPatch(
        {
          version: 2,
          policy: {
            system: null,
            organization: null,
            profile: {
              modelRestrictions: {
                allowedModels: ["gpt-5.4-mini"],
              },
            },
            workspaces: {},
          },
        },
        {
          model: "gpt-5.4",
        },
      ),
    /cannot set a default model outside the allowed model restrictions/i,
  );
});

test("applyDesktopSettingsPatch persists the currently exposed workspace and approval settings", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: null,
        workspaces: {},
      },
    },
    {
      workspaceReadonly: "readonly",
      workspaceFolderBinding: "none",
      approvalOperationPosture: "askRisky",
      approvalTrustedWorkspaces: "~/work/*, ~/clients/acme",
    },
  );

  assert.deepEqual(next.policy.profile, {
    approvalDefaults: {
      approvalOperationPosture: "askRisky",
      approvalTrustedWorkspaces: "~/work/*, ~/clients/acme",
    },
    generalDefaults: {
      workspaceFolderBinding: "none",
      workspaceReadonly: "readonly",
    },
  });

  assert.deepEqual(resolveDesktopSettings(next), {
    ...resolveDesktopSettings(),
    workspaceReadonly: "readonly",
    workspaceFolderBinding: "none",
    approvalOperationPosture: "askRisky",
    approvalTrustedWorkspaces: "~/work/*, ~/clients/acme",
  });
});

test("applyDesktopSettingsPatch persists runtime instructions under general defaults", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: null,
        workspaces: {},
      },
    },
    {
      runtimeInstructions: "Custom runtime policy text.\nKeep it short.",
    },
  );

  assert.deepEqual(next.policy.profile, {
    generalDefaults: {
      runtimeInstructions: "Custom runtime policy text.\nKeep it short.",
    },
  });
  assert.equal(resolveDesktopSettings(next).runtimeInstructions, "Custom runtime policy text.\nKeep it short.");
});

test("applyDesktopSettingsPatch persists the default service tier under workspace defaults", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: null,
        workspaces: {},
      },
    },
    {
      serviceTier: "fast",
    },
  );

  assert.deepEqual(next.policy.profile, {
    workspaceDefaults: {
      serviceTier: "fast",
    },
  });
  assert.equal(resolveDesktopSettings(next).serviceTier, "fast");
});

test("applyDesktopSettingsPatch persists the default operating mode under general defaults", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: null,
        workspaces: {},
      },
    },
    {
      defaultOperatingMode: "preview",
    },
  );

  assert.deepEqual(next.policy.profile, {
    generalDefaults: {
      defaultOperatingMode: "preview",
    },
  });
  assert.equal(resolveDesktopSettings(next).defaultOperatingMode, "preview");
});

test("applyDesktopSettingsPatch keeps cleared trusted workspace rules honest", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: {
          approvalDefaults: {
            approvalTrustedWorkspaces: "~/work/*",
          },
        },
        workspaces: {},
      },
    },
    {
      approvalTrustedWorkspaces: "   ",
    },
  );

  assert.equal(resolveDesktopSettings(next).approvalTrustedWorkspaces, "");
});

test("applyDesktopSettingsPatch persists trusted skill approvals under approval defaults", () => {
  const next = applyDesktopSettingsPatch(
    {
      version: 2,
      policy: {
        system: null,
        organization: null,
        profile: null,
        workspaces: {},
      },
    },
    {
      trustedSkillApprovals: [
        "/Users/george/.codex/skills/autopilot/SKILL.md::mtime:1",
        "/Users/george/.codex/skills/autopilot/SKILL.md::mtime:1",
        "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md::mtime:2",
      ],
    },
  );

  assert.deepEqual(next.policy.profile, {
    approvalDefaults: {
      trustedSkillApprovals: [
        "/Users/george/.codex/skills/autopilot/SKILL.md::mtime:1",
        "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md::mtime:2",
      ],
    },
  });
  assert.deepEqual(resolveDesktopSettings(next).trustedSkillApprovals, [
    "/Users/george/.codex/skills/autopilot/SKILL.md::mtime:1",
    "/Users/george/.codex/plugins/gmail/skills/gmail/SKILL.md::mtime:2",
  ]);
});
