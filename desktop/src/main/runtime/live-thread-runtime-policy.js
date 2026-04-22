function firstString(...values) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function asRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value;
}

export function normalizeDesktopPersonality(value) {
  const resolved = firstString(value);
  if (resolved === "none" || resolved === "friendly" || resolved === "pragmatic") {
    return resolved;
  }

  if (resolved === "concise" || resolved === "formal" || resolved === "detailed") {
    return "pragmatic";
  }

  return DEFAULT_DESKTOP_PERSONALITY;
}

export const DEFAULT_DESKTOP_MODEL = "gpt-5.4-mini";
const DEFAULT_DESKTOP_PERSONALITY = "friendly";
export const DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS = "Follow the Sense-1 desktop runtime contract.";
const DEFAULT_DESKTOP_APPROVAL_POSTURE = "onRequest";
const DEFAULT_DESKTOP_SANDBOX_POSTURE = "workspaceWrite";
const DEFAULT_DESKTOP_OPERATING_MODE = "auto";
const DEFAULT_DESKTOP_VERBOSITY = "medium";
const DESKTOP_THREAD_CONFIG = Object.freeze({
  developer_instructions: "",
  instructions: "",
  tools: {
    view_image: true,
  },
  web_search: "live",
});

const DESKTOP_APPROVAL_POLICY = Object.freeze({
  granular: {
    mcp_elicitations: true,
    request_permissions: true,
    rules: true,
    sandbox_approval: true,
    skill_approval: true,
  },
});

export function cloneDesktopThreadConfig() {
  return {
    ...DESKTOP_THREAD_CONFIG,
    tools: {
      ...DESKTOP_THREAD_CONFIG.tools,
    },
  };
}

function normalizeApprovalPolicy(policy) {
  const resolvedPolicy = firstString(policy);
  if (!resolvedPolicy || resolvedPolicy === "onRequest" || resolvedPolicy === "on-request") {
    return {
      granular: {
        ...DESKTOP_APPROVAL_POLICY.granular,
      },
    };
  }

  if (resolvedPolicy === "onFailure") {
    return "on-failure";
  }

  return resolvedPolicy;
}

function normalizeSandboxPolicy(policy) {
  const resolvedPolicy = firstString(policy);
  if (!resolvedPolicy) {
    return "read-only";
  }

  if (resolvedPolicy === "workspaceWrite") {
    return "workspace-write";
  }

  if (resolvedPolicy === "readOnly") {
    return "read-only";
  }

  return resolvedPolicy;
}

export function buildExecutionOverrides(executionContext = null) {
  return {
    approvalPolicy: normalizeApprovalPolicy(executionContext?.policy?.approvalPolicy),
    sandboxPolicy: normalizeSandboxPolicy(executionContext?.policy?.sandboxPolicy),
  };
}

function resolveDesktopRuntimeInstructions(runtimeInstructions = null) {
  if (typeof runtimeInstructions !== "string") {
    return DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS;
  }

  const normalizedInstructions = runtimeInstructions.trim();
  return normalizedInstructions || DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS;
}

function normalizeApprovalPosture(value) {
  const resolved = firstString(value);
  if (resolved === "onRequest" || resolved === "unlessTrusted" || resolved === "never") {
    return resolved;
  }

  return DEFAULT_DESKTOP_APPROVAL_POSTURE;
}

function normalizeSandboxPosture(value) {
  const resolved = firstString(value);
  if (resolved === "workspaceWrite" || resolved === "readOnly") {
    return resolved;
  }

  return DEFAULT_DESKTOP_SANDBOX_POSTURE;
}

function normalizeOperatingMode(value) {
  const resolved = firstString(value);
  if (resolved === "preview" || resolved === "auto" || resolved === "apply") {
    return resolved;
  }

  return DEFAULT_DESKTOP_OPERATING_MODE;
}

export function normalizeDesktopVerbosity(value, fallback = DEFAULT_DESKTOP_VERBOSITY) {
  const resolved = firstString(value);
  if (resolved === "low" || resolved === "medium" || resolved === "high") {
    return resolved;
  }

  if (resolved === "terse") {
    return "low";
  }

  if (resolved === "balanced") {
    return "medium";
  }

  if (resolved === "detailed") {
    return "high";
  }

  return fallback;
}

function resolvePolicyRuleSettings(settings = null, runtimeInstructions = null, verbosity = null) {
  const record = asRecord(settings) ?? {};
  return {
    personality: normalizeDesktopPersonality(record.personality),
    verbosity: normalizeDesktopVerbosity(verbosity ?? record.verbosity),
    defaultOperatingMode: normalizeOperatingMode(record.defaultOperatingMode),
    runtimeInstructions: resolveDesktopRuntimeInstructions(runtimeInstructions ?? record.runtimeInstructions),
    approvalPosture: normalizeApprovalPosture(record.approvalPosture),
    sandboxPosture: normalizeSandboxPosture(record.sandboxPosture),
  };
}

function describePersonalityRule(personality) {
  if (personality === "none") {
    return {
      currentValue: "Neutral",
      description: "Sense-1 keeps its tone neutral and direct instead of adding extra friendliness.",
    };
  }

  if (personality === "pragmatic") {
    return {
      currentValue: "Pragmatic",
      description: "Sense-1 favors a concise, practical tone that stays calm and businesslike.",
    };
  }

  return {
    currentValue: "Friendly",
    description: "Sense-1 uses a friendly, direct tone while still keeping answers calm and clear.",
  };
}

function describeVerbosityRule(verbosity) {
  if (verbosity === "low") {
    return {
      currentValue: "Low",
      description: "Sense-1 keeps replies compact and expands only when accuracy or the user requires more detail.",
      developerInstruction:
        "Prefer short answers by default. Keep updates brief, skip unnecessary preamble, and expand only when needed for accuracy or when the user asks for more detail.",
    };
  }

  if (verbosity === "high") {
    return {
      currentValue: "High",
      description: "Sense-1 includes more explanation and context by default when it helps the user follow the work.",
      developerInstruction:
        "When it helps, provide a bit more explanation and context so the user can follow the work and tradeoffs.",
    };
  }

  return {
    currentValue: "Medium",
    description: "Sense-1 aims for concise but sufficient detail by default.",
    developerInstruction:
      "Default to concise but sufficient answers. Use enough detail to be clear without over-explaining.",
  };
}

function describeApprovalPostureRule(approvalPosture) {
  if (approvalPosture === "never") {
    return {
      currentValue: "Avoid routine prompts",
      description: "Sense-1 avoids routine approval stops where policy allows, while hard safety rules can still block disallowed actions.",
    };
  }

  if (approvalPosture === "unlessTrusted") {
    return {
      currentValue: "Trust-aware approvals",
      description: "Sense-1 can move through lower-risk work in trusted contexts, but risky actions still ask first.",
    };
  }

  return {
    currentValue: "Ask on request",
    description: "Sense-1 asks for approval before risky or sensitive actions.",
  };
}

function describeSandboxPostureRule(sandboxPosture) {
  if (sandboxPosture === "readOnly") {
    return {
      currentValue: "Read-only first",
      description: "Sense-1 starts from a read-only posture unless a narrower writable location is granted for the run.",
    };
  }

  return {
    currentValue: "Write inside chosen folder",
    description: "When a workspace or session folder is available, Sense-1 can write inside that location instead of the whole machine.",
  };
}

function describeOperatingModeRule(defaultOperatingMode) {
  if (defaultOperatingMode === "preview") {
    return {
      currentValue: "Preview",
      description: "New folder work starts in preview mode so Sense-1 reads and proposes before acting.",
    };
  }

  if (defaultOperatingMode === "apply") {
    return {
      currentValue: "Apply",
      description: "New folder work starts in apply mode so Sense-1 can act directly inside the chosen folder.",
    };
  }

  return {
    currentValue: "Auto",
    description: "New folder work starts in auto mode so Sense-1 can choose between reading, asking, and acting based on the task.",
  };
}

function buildPolicyRuleGroups({
  cwd = null,
  runtimeInstructions = null,
  settings = null,
  verbosity = null,
  workspaceContextInstruction = null,
  workspaceRoot = null,
} = {}) {
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  const resolvedCwd = firstString(cwd);
  const resolvedSettings = resolvePolicyRuleSettings(settings, runtimeInstructions, verbosity);
  const personalityRule = describePersonalityRule(resolvedSettings.personality);
  const verbosityRule = describeVerbosityRule(resolvedSettings.verbosity);
  const approvalRule = describeApprovalPostureRule(resolvedSettings.approvalPosture);
  const sandboxRule = describeSandboxPostureRule(resolvedSettings.sandboxPosture);
  const operatingModeRule = describeOperatingModeRule(resolvedSettings.defaultOperatingMode);
  return [
    {
      id: "identity",
      topic: "Identity & personality",
      rules: [
        {
          id: "runtime-guidance",
          label: "Custom instructions",
          currentValue:
            resolvedSettings.runtimeInstructions === DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS ? "Default" : "Custom",
          description:
            resolvedSettings.runtimeInstructions === DEFAULT_DESKTOP_RUNTIME_INSTRUCTIONS
              ? "Sense-1 uses the default desktop custom-instruction contract unless extra guidance is configured."
              : "Sense-1 merges custom user guidance into every run alongside the built-in workspace and safety rules.",
          developerInstruction: resolvedSettings.runtimeInstructions,
        },
        {
          id: "personality",
          label: "Voice",
          currentValue: personalityRule.currentValue,
          description: personalityRule.description,
        },
        {
          id: "verbosity",
          label: "Response detail",
          currentValue: verbosityRule.currentValue,
          description: verbosityRule.description,
          developerInstruction: verbosityRule.developerInstruction,
        },
        {
          id: "response-structure",
          label: "Response structure",
          currentValue: "Scannable",
          description:
            "Sense-1 structures replies to be easy to skim - pattern first, then detail, with headings, tables, lists, and bolded key phrases.",
          developerInstruction:
            "Structure responses so they skim well: lead with the headline claim or pattern, then supporting detail. Use short H3 headings (###) to mark sections when a response has three or more distinct parts. Use Markdown tables for comparisons, option matrices, or per-item mappings - one row per item. Use numbered lists for ordered or ranked items (steps, priorities, options) and bullets for unordered collections. Bold the key phrase in each paragraph so a skimmer catches the point. Use fenced code blocks with a language label for code, commands, or config, and inline `code` for short identifiers, flags, or filenames. Use blockquotes (>) to surface a direct quote or constraint from source material. Prefer two short paragraphs over one long one - one idea per paragraph.",
        },
      ],
    },
    {
      id: "file-handling",
      topic: "File handling",
      rules: [
        {
          id: "deliverable-formats",
          label: "Default deliverable formats",
          currentValue: "CSV, HTML, text",
          description:
            "When Sense-1 creates documents, spreadsheets, or reports for knowledge work, it prefers CSV, HTML, and plain text over Markdown unless the user clearly asks for Markdown or the folder is code-first.",
          developerInstruction:
            "When creating documents, spreadsheets, or reports for knowledge workers, prefer professional formats: CSV for tabular data, HTML for formatted documents, plain text for notes. Do not default to Markdown unless the user explicitly asks for it or the workspace is a code project.",
        },
        {
          id: "file-names",
          label: "File naming",
          currentValue: "Descriptive names",
          description:
            "Sense-1 uses descriptive file names based on the topic and output type instead of generic names like output or result.",
          developerInstruction:
            "Name output files descriptively using the topic and type, for example: startup_runway_budget.csv, project_summary.html, meeting_notes.txt. Avoid generic names like output.md or result.txt.",
        },
        {
          id: "deliverable-cleanliness",
          label: "Deliverables stay in the workspace",
          currentValue: "No auto-open",
          description:
            "Sense-1 saves finished files into the active workspace or session area, avoids half-finished outputs, and does not launch external apps after creating a file.",
          developerInstruction:
            "Files you create are saved in the user's workspace or session folder. The user can see them in the sidebar. Create clean, final deliverables - not drafts or intermediate files. NEVER run 'open' or any command that launches files in external applications after creating them. The user opens files from the sidebar when ready.",
        },
        {
          id: "deliverable-destination-priority",
          label: "Deliverable destination priority",
          currentValue: "Explicit path, then workspace root",
          description:
            "Sense-1 follows the user's requested save path first, otherwise saves at the workspace root, and avoids auto-creating repo-style output buckets unless asked.",
          developerInstruction:
            "For final deliverables like documents, spreadsheets, presentations, and reports, follow this destination order: (1) an explicit output path the user asked for, (2) the selected workspace root, (3) the chat's session artifact folder when no workspace is selected. Do not auto-create repo-style buckets like output/doc, output/spreadsheet, output/pptx, or similar unless the user explicitly asks for that folder. Do not invent type-specific subfolders on your own.",
        },
      ],
    },
    {
      id: "workspace-boundaries",
      topic: "Workspace boundaries",
      rules: [
        {
          id: "selected-folder-scope",
          label: "Selected folder scope",
          currentValue: resolvedWorkspaceRoot ? "Folder selected" : "No folder selected",
          description: resolvedWorkspaceRoot
            ? `Sense-1 is currently workspace-bound to ${resolvedWorkspaceRoot} and should stay inside that folder.`
            : "When a workspace folder is selected, Sense-1 stays inside that folder and refuses writes outside it.",
          developerInstruction: resolvedWorkspaceRoot
            ? `Work inside the granted workspace folder at ${resolvedWorkspaceRoot}. Do not create, modify, or delete files outside this folder. If the user asks to write to a path outside ${resolvedWorkspaceRoot}, refuse and explain that the current session is bound to this folder.`
            : "Do not describe the run as workspace-bound unless a workspaceRoot is explicitly provided.",
        },
        {
          id: "workspace-context",
          label: "Grounding from key files",
          currentValue: workspaceContextInstruction ? "Context files attached" : "No context files attached",
          description:
            "When key files from the selected folder are available, Sense-1 reads them first to understand the project before acting.",
          developerInstruction: workspaceContextInstruction,
        },
        {
          id: "artifact-folder-scope",
          label: "Chat artifact scope",
          currentValue: resolvedWorkspaceRoot ? "Workspace folder" : "Session artifact folder",
          description: resolvedWorkspaceRoot
            ? "Workspace runs save into the selected folder rather than a separate scratch area."
            : "Without a selected folder, Sense-1 keeps any local file work inside the chat's own artifact folder.",
          developerInstruction:
            resolvedCwd && !resolvedWorkspaceRoot
              ? `When you need to create local files without a user-selected workspace, keep them inside ${resolvedCwd}. Do not write to paths outside this directory.`
              : null,
        },
        {
          id: "folder-selection",
          label: "Switching folders",
          currentValue: resolvedWorkspaceRoot ? "Already bound" : "Ask first",
          description:
            "If the user wants work in a different local folder, Sense-1 asks them to choose that folder first instead of guessing a path.",
          developerInstruction: !resolvedWorkspaceRoot
            ? "If the user asks you to work in another local folder, ask them to choose that folder first."
            : null,
        },
        {
          id: "default-operating-mode",
          label: "Default folder mode",
          currentValue: operatingModeRule.currentValue,
          description: operatingModeRule.description,
        },
      ],
    },
    {
      id: "permissions-approvals",
      topic: "Permissions & approvals",
      rules: [
        {
          id: "approval-posture",
          label: "Approval posture",
          currentValue: approvalRule.currentValue,
          description: approvalRule.description,
        },
        {
          id: "sandbox-posture",
          label: "Write posture",
          currentValue: sandboxRule.currentValue,
          description: sandboxRule.description,
        },
      ],
    },
  ];
}

export function describePolicyRules(settings = null) {
  return buildPolicyRuleGroups({ settings }).map((group) => ({
    id: group.id,
    topic: group.topic,
    rules: group.rules.map(({ id, label, currentValue = null, description }) => ({
      id,
      label,
      currentValue,
      description,
    })),
  }));
}

function collectDeveloperInstructions(groups) {
  const rulesById = new Map();
  for (const group of groups) {
    for (const rule of group.rules) {
      rulesById.set(rule.id, rule.developerInstruction ?? null);
    }
  }

  return [
    "runtime-guidance",
    "verbosity",
    "response-structure",
    "selected-folder-scope",
    "deliverable-formats",
    "file-names",
    "deliverable-cleanliness",
    "deliverable-destination-priority",
    "workspace-context",
    "artifact-folder-scope",
    "folder-selection",
  ]
    .map((id) => rulesById.get(id))
    .filter(Boolean)
    .join(" ");
}

export function buildInstructionSet({
  authority = "the signed-in user working inside the private profile scope",
  cwd = null,
  runtimeInstructions = null,
  settings = null,
  verbosity = null,
  workspaceContextInstruction = null,
  workspaceRoot = null,
} = {}) {
  const resolvedCwd = firstString(cwd);
  const resolvedWorkspaceRoot = firstString(workspaceRoot);
  const resolvedRuntimeInstructions = resolveDesktopRuntimeInstructions(runtimeInstructions);
  const baseInstructions = [
    "You are Sense-1, the native desktop product assistant.",
    "Work calmly, directly, and explain outcomes in plain English.",
    `You are acting on behalf of ${authority}.`,
    resolvedWorkspaceRoot
      ? `The user explicitly chose this local folder for the current run: ${resolvedWorkspaceRoot}. Treat it as the active workspace.`
      : "No user workspace folder is currently selected for this run.",
    resolvedCwd && !resolvedWorkspaceRoot
      ? `Use this chat's artifact folder for notes, generated files, and scratch work: ${resolvedCwd}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const developerInstructions = collectDeveloperInstructions(
    buildPolicyRuleGroups({
      cwd: resolvedCwd,
      runtimeInstructions: resolvedRuntimeInstructions,
      settings,
      verbosity,
      workspaceContextInstruction,
      workspaceRoot: resolvedWorkspaceRoot,
    }),
  );

  return {
    baseInstructions,
    developerInstructions,
  };
}
