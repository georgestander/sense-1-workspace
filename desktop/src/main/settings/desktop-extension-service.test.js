import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DesktopExtensionService } from "./desktop-extension-service.ts";
import { ensureProfileDirectories } from "../profile/profile-paths.js";

function createManager(request) {
  return {
    request,
  };
}

function createAccountReadResult() {
  return {
    account: {
      email: "george@example.com",
      type: "chatgpt",
    },
    authMode: "chatgpt",
    requiresOpenaiAuth: false,
  };
}

async function createInstalledPluginFixture() {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-plugin-"));
  await fs.writeFile(
    path.join(pluginRoot, ".app.json"),
    JSON.stringify({
      apps: {
        gmail: {
          id: "connector_gmail",
        },
      },
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "plugin-mcp": {
          type: "http",
          url: "https://example.com/mcp",
        },
      },
    }),
    "utf8",
  );
  await fs.mkdir(path.join(pluginRoot, "skills", "gmail"), { recursive: true });
  await fs.writeFile(path.join(pluginRoot, "skills", "gmail", "SKILL.md"), "# Gmail\n", "utf8");
  return pluginRoot;
}

function findManagedExtension(overview, kind, id) {
  return overview.managedExtensions.find((entry) => entry.kind === kind && entry.id === id) ?? null;
}

test("getOverview preserves marketplace metadata and uses the profile codex home for plugin discovery", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];
  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method, params) => {
        managerCalls.push({ method, params });

        if (method === "config/read") {
          return {
            config: {
              apps: {
                gmail: {
                  enabled: false,
                },
              },
              plugins: {
                gmail: {
                  enabled: true,
                },
              },
            },
          };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: false,
                    enabled: false,
                    source: {
                      path: pluginRoot,
                    },
                    installPolicy: "AVAILABLE",
                    authPolicy: "ON_INSTALL",
                    interface: {
                      displayName: "Gmail",
                      shortDescription: "Read and draft Gmail.",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "gmail",
                name: "Gmail",
                installUrl: "https://chatgpt.com/gmail/install",
                isAccessible: false,
                isEnabled: false,
                pluginDisplayNames: ["Gmail"],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({
      cwd: "/tmp/workspace-gmail",
      forceRefetch: true,
    });

    assert.equal(overview.contractVersion, 1);
    const pluginListCall = managerCalls.find((entry) => entry.method === "plugin/list");
    const skillsListCall = managerCalls.find((entry) => entry.method === "skills/list");
    assert.deepEqual(pluginListCall?.params, {
      cwds: [codexHome],
      forceRemoteSync: true,
    });
    assert.deepEqual(skillsListCall?.params, {
      cwds: [codexHome],
      forceReload: true,
    });
    assert.deepEqual(overview.plugins[0], {
      id: "gmail",
      name: "gmail",
      displayName: "Gmail",
      description: "Read and draft Gmail.",
      appIds: ["connector_gmail"],
      marketplaceName: "OpenAI Curated",
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      installed: true,
      enabled: true,
      installPolicy: "AVAILABLE",
      authPolicy: "ON_INSTALL",
      category: null,
      capabilities: [],
      sourcePath: pluginRoot,
      websiteUrl: null,
      iconPath: null,
    });

    assert.deepEqual(overview.apps[0], {
      id: "gmail",
      name: "Gmail",
      description: null,
      installUrl: "https://chatgpt.com/gmail/install",
      isAccessible: false,
      isEnabled: false,
      pluginDisplayNames: ["Gmail"],
      logoUrl: null,
    });
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("getOverview emits normalized managed extensions with ownership, auth, and composition metadata", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const pluginRoot = await createInstalledPluginFixture();
  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return {
            config: {
              apps: {
                connector_gmail: {
                  enabled: false,
                },
              },
              mcp_servers: {
                "plugin-mcp": {
                  enabled: true,
                  url: "https://example.com/mcp",
                },
              },
              plugins: {
                gmail: {
                  enabled: true,
                },
              },
            },
          };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: {
                      path: pluginRoot,
                    },
                    installPolicy: "AVAILABLE",
                    authPolicy: "ON_INSTALL",
                    interface: {
                      displayName: "Gmail",
                      shortDescription: "Read and draft Gmail.",
                      capabilities: ["Interactive", "Write"],
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "connector_gmail",
                name: "Gmail",
                description: "Read Gmail",
                installUrl: "https://chatgpt.com/gmail/install",
                isAccessible: false,
                isEnabled: false,
                pluginDisplayNames: ["Gmail"],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return {
            data: [
              {
                id: "plugin-mcp",
                state: "ready",
                authStatus: "connected",
                tools: [{ name: "search" }],
                resources: [{ name: "docs" }],
              },
            ],
          };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });
    const pluginRecord = findManagedExtension(overview, "plugin", "gmail");
    const appRecord = findManagedExtension(overview, "app", "connector_gmail");
    const skillRecord = findManagedExtension(overview, "skill", path.join(pluginRoot, "skills", "gmail", "SKILL.md"));
    const mcpRecord = findManagedExtension(overview, "mcp", "plugin-mcp");

    assert.deepEqual(pluginRecord, {
      id: "gmail",
      kind: "plugin",
      name: "gmail",
      displayName: "Gmail",
      description: "Read and draft Gmail.",
      installState: "installed",
      enablementState: "enabled",
      authState: "required",
      healthState: "warning",
      ownership: "marketplace-installed",
      ownerPluginIds: [],
      includedSkillIds: [path.join(pluginRoot, "skills", "gmail", "SKILL.md")],
      includedAppIds: ["connector_gmail"],
      includedMcpServerIds: ["plugin-mcp"],
      capabilities: ["Interactive", "Write"],
      sourcePath: pluginRoot,
      marketplaceName: "OpenAI Curated",
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      canOpen: true,
      canUninstall: false,
      canDisable: true,
      canConnect: true,
      canReload: false,
    });
    assert.deepEqual(appRecord, {
      id: "connector_gmail",
      kind: "app",
      name: "Gmail",
      displayName: "Gmail",
      description: "Read Gmail",
      installState: "installed",
      enablementState: "disabled",
      authState: "required",
      healthState: "warning",
      ownership: "plugin-owned",
      ownerPluginIds: ["gmail"],
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: null,
      marketplaceName: null,
      marketplacePath: null,
      canOpen: false,
      canUninstall: false,
      canDisable: false,
      canConnect: true,
      canReload: false,
    });
    assert.deepEqual(skillRecord, {
      id: path.join(pluginRoot, "skills", "gmail", "SKILL.md"),
      kind: "skill",
      name: "gmail:gmail",
      displayName: "gmail:gmail",
      description: null,
      installState: "installed",
      enablementState: "enabled",
      authState: "not-required",
      healthState: "healthy",
      ownership: "plugin-owned",
      ownerPluginIds: ["gmail"],
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: path.join(pluginRoot, "skills", "gmail", "SKILL.md"),
      marketplaceName: "OpenAI Curated",
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      canOpen: true,
      canUninstall: false,
      canDisable: true,
      canConnect: false,
      canReload: false,
    });
    assert.deepEqual(mcpRecord, {
      id: "plugin-mcp",
      kind: "mcp",
      name: "plugin-mcp",
      displayName: "plugin-mcp",
      description: "https://example.com/mcp",
      installState: "installed",
      enablementState: "enabled",
      authState: "connected",
      healthState: "healthy",
      ownership: "plugin-owned",
      ownerPluginIds: ["gmail"],
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: null,
      marketplaceName: "OpenAI Curated",
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      canOpen: false,
      canUninstall: false,
      canDisable: true,
      canConnect: true,
      canReload: true,
    });
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("getOverview merges file-backed plugin and app enablement when runtime config is stale", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const pluginRoot = await createInstalledPluginFixture();

  try {
    await fs.writeFile(
      path.join(codexHome, "config.toml"),
      [
        "[features]",
        "apps = true",
        "",
        '[plugins."gmail@openai-curated"]',
        "enabled = true",
        "",
        '[apps."connector_gmail"]',
        "enabled = true",
        "",
      ].join("\n"),
      "utf8",
    );

    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return {
            config: {
              apps: {},
              features: {},
              plugins: {},
            },
          };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail@openai-curated",
                    name: "gmail",
                    installed: true,
                    enabled: false,
                    source: {
                      path: pluginRoot,
                    },
                    interface: {
                      displayName: "Gmail",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "connector_gmail",
                name: "Gmail",
                isAccessible: true,
                isEnabled: false,
                pluginDisplayNames: [],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });
    assert.equal(overview.plugins[0]?.enabled, true);
    assert.equal(overview.apps[0]?.isEnabled, true);
    assert.equal(findManagedExtension(overview, "plugin", "gmail@openai-curated")?.enablementState, "enabled");
    assert.equal(findManagedExtension(overview, "app", "connector_gmail")?.enablementState, "enabled");
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("getOverview does not treat apps linked only to discoverable plugins as installed plugin-owned inventory", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const service = new DesktopExtensionService({
    env,
    manager: createManager(async (method) => {
      if (method === "config/read") {
        return { config: { apps: {}, plugins: {} } };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "OpenAI Curated",
              path: "/tmp/openai-curated-marketplace.json",
              plugins: [
                {
                  id: "gmail",
                  name: "gmail",
                  installed: false,
                  enabled: false,
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "connector_gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: false,
              isEnabled: false,
              pluginDisplayNames: ["Gmail"],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "config/mcpServer/reload") {
        return { ok: true };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  try {
    const overview = await service.getOverview({ forceRefetch: true });
    assert.deepEqual(findManagedExtension(overview, "app", "connector_gmail"), {
      id: "connector_gmail",
      kind: "app",
      name: "Gmail",
      displayName: "Gmail",
      description: null,
      installState: "discoverable",
      enablementState: "disabled",
      authState: "required",
      healthState: "warning",
      ownership: "built-in",
      ownerPluginIds: [],
      includedSkillIds: [],
      includedAppIds: [],
      includedMcpServerIds: [],
      capabilities: [],
      sourcePath: null,
      marketplaceName: null,
      marketplacePath: null,
      canOpen: false,
      canUninstall: false,
      canDisable: false,
      canConnect: true,
      canReload: false,
    });
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("getOverview preserves local mcp enablement when runtime config is stale after restart", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);

  try {
    await fs.writeFile(
      path.join(codexHome, "config.toml"),
      [
        '[mcp_servers.docs]',
        "enabled = false",
        "",
      ].join("\n"),
      "utf8",
    );

    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return {
            config: {
              mcp_servers: {},
            },
          };
        }

        if (method === "plugin/list") {
          return { marketplaces: [] };
        }

        if (method === "app/list") {
          return { data: [] };
        }

        if (method === "mcpServerStatus/list") {
          return {
            data: [
              {
                id: "docs",
                state: "ready",
                authStatus: "connected",
                tools: [],
                resources: [],
              },
            ],
          };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });
    assert.equal(overview.mcpServers[0]?.enabled, false);
    assert.equal(findManagedExtension(overview, "mcp", "docs")?.enablementState, "disabled");
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("getOverview marks failed MCP auth as recoverable error state", async () => {
  const service = new DesktopExtensionService({
    manager: createManager(async (method) => {
      if (method === "config/read") {
        return {
          config: {
            mcp_servers: {
              docs: {
                enabled: true,
              },
            },
          },
        };
      }

      if (method === "plugin/list") {
        return { marketplaces: [] };
      }

      if (method === "app/list") {
        return { data: [] };
      }

      if (method === "mcpServerStatus/list") {
        return {
          data: [
            {
              id: "docs",
              state: "error",
              authStatus: "failed",
              tools: [],
              resources: [],
            },
          ],
        };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  const overview = await service.getOverview({ forceRefetch: true });
  const managedMcp = findManagedExtension(overview, "mcp", "docs");
  assert.equal(managedMcp?.authState, "failed");
  assert.equal(managedMcp?.healthState, "error");
  assert.equal(managedMcp?.canConnect, true);
});

test("getOverview marks legacy profile-owned skills as uninstallable profile inventory", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const skillRoot = path.join(codexHome, "skills", "legacy-skill");
  const skillPath = path.join(skillRoot, "SKILL.md");

  try {
    await fs.mkdir(skillRoot, { recursive: true });
    await fs.writeFile(skillPath, "# Legacy skill\n", "utf8");

    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return { config: {} };
        }

        if (method === "plugin/list") {
          return { marketplaces: [] };
        }

        if (method === "app/list") {
          return { data: [] };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return {
            data: [
              {
                cwd: codexHome,
                skills: [
                  {
                    name: "legacy-skill",
                    path: skillPath,
                    description: "Legacy profile skill",
                    enabled: true,
                  },
                ],
              },
            ],
          };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });
    const managedSkill = findManagedExtension(overview, "skill", skillPath);
    assert.equal(managedSkill?.ownership, "profile-owned");
    assert.equal(managedSkill?.canUninstall, true);
    assert.equal(managedSkill?.canOpen, true);
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("getOverview marks manually created profile plugins as uninstallable profile inventory", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const pluginRoot = path.join(codexHome, "plugins", "manual-plugin");

  try {
    await fs.mkdir(path.join(pluginRoot, ".codex-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(pluginRoot, ".codex-plugin", "plugin.json"),
      JSON.stringify({
        interface: {
          displayName: "Manual Plugin",
          shortDescription: "Manual profile install",
        },
      }),
      "utf8",
    );

    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return {
            config: {
              plugins: {
                "manual-plugin": {
                  enabled: true,
                },
              },
            },
          };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "Profile plugins",
                path: path.join(codexHome, ".agents", "plugins", "marketplace.json"),
                plugins: [
                  {
                    id: "manual-plugin",
                    name: "manual-plugin",
                    installed: true,
                    enabled: true,
                    source: {
                      path: pluginRoot,
                    },
                    interface: {
                      displayName: "Manual Plugin",
                      shortDescription: "Manual profile install",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return { data: [] };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });
    const managedPlugin = findManagedExtension(overview, "plugin", "manual-plugin");
    assert.equal(managedPlugin?.ownership, "profile-owned");
    assert.equal(managedPlugin?.canUninstall, true);
    assert.equal(overview.plugins[0]?.sourcePath, pluginRoot);
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("getOverview ignores stale plugin and app config references without creating ghost inventory", async () => {
  const service = new DesktopExtensionService({
    manager: createManager(async (method) => {
      if (method === "config/read") {
        return {
          config: {
            apps: {
              ghost_app: {
                enabled: true,
              },
            },
            plugins: {
              ghost_plugin: {
                enabled: true,
              },
            },
          },
        };
      }

      if (method === "plugin/list") {
        return { marketplaces: [] };
      }

      if (method === "app/list") {
        return { data: [] };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  const overview = await service.getOverview({ forceRefetch: true });
  assert.deepEqual(overview.plugins, []);
  assert.deepEqual(overview.apps, []);
  assert.deepEqual(overview.managedExtensions, []);
});

test("installPlugin enables manifest-backed apps even when plugin/install omits app ids", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];
  const managedAuthOpened = [];
  const externallyOpened = [];
  let installed = false;

  const service = new DesktopExtensionService({
    manager: createManager(async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "plugin/install") {
        installed = true;
        return {};
      }

      if (method === "config/batchWrite") {
        return { ok: true };
      }

      if (method === "config/read") {
        return {
          config: {
            apps: {
              gmail: {
                enabled: true,
              },
            },
            plugins: {
              gmail: {
                enabled: true,
              },
            },
            features: {
              apps: true,
            },
          },
        };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "OpenAI Curated",
              path: "/tmp/openai-curated-marketplace.json",
              plugins: [
                {
                  id: "gmail",
                  name: "gmail",
                  installed,
                  enabled: true,
                  source: {
                    path: pluginRoot,
                  },
                  installPolicy: "AVAILABLE",
                  authPolicy: "ON_INSTALL",
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "connector_gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: false,
              isEnabled: true,
              pluginDisplayNames: [],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "config/mcpServer/reload") {
        return { ok: true };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async (url) => {
      externallyOpened.push(url);
    },
    openManagedAuth: async (url) => {
      managedAuthOpened.push(url);
    },
    resolveProfile: async () => ({ id: "default" }),
  });

  const overview = await service.installPlugin({
    marketplacePath: "/tmp/openai-curated-marketplace.json",
    pluginId: "gmail",
    pluginName: "gmail",
  });

  const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
  assert.deepEqual(batchWriteCall?.params, {
    edits: [
      {
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "plugins.gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "apps.connector_gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "mcp_servers.plugin-mcp.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
    ],
  });
  assert.ok(managerCalls.some((entry) => entry.method === "config/mcpServer/reload"));
  assert.deepEqual(managedAuthOpened, ["https://chatgpt.com/gmail/install"]);
  assert.deepEqual(externallyOpened, []);
  assert.equal(overview.plugins[0]?.installed, true);
  assert.deepEqual(overview.apps[0]?.pluginDisplayNames, ["Gmail", "gmail"]);
});

test("installPlugin writes enablement using the canonical installed plugin id", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];
  let installed = false;

  const service = new DesktopExtensionService({
    manager: createManager(async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "plugin/install") {
        installed = true;
        return {};
      }

      if (method === "config/batchWrite") {
        return { ok: true };
      }

      if (method === "config/read") {
        return {
          config: {
            apps: {
              connector_gmail: {
                enabled: true,
              },
            },
            plugins: {
              "gmail@openai-curated": {
                enabled: true,
              },
            },
            features: {
              apps: true,
            },
          },
        };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "OpenAI Curated",
              path: "/tmp/openai-curated-marketplace.json",
              plugins: [
                {
                  id: "gmail@openai-curated",
                  name: "gmail",
                  installed,
                  enabled: true,
                  source: {
                    path: pluginRoot,
                  },
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "connector_gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: true,
              isEnabled: true,
              pluginDisplayNames: [],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "config/mcpServer/reload") {
        return { ok: true };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  await service.installPlugin({
    marketplacePath: "/tmp/openai-curated-marketplace.json",
    pluginId: "gmail",
    pluginName: "gmail",
  });

  const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
  assert.deepEqual(batchWriteCall?.params, {
    edits: [
      {
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: 'plugins."gmail@openai-curated".enabled',
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "apps.connector_gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "mcp_servers.plugin-mcp.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
    ],
  });
});

test("setPluginEnabled enables manifest-backed apps for installed plugins", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];

  const service = new DesktopExtensionService({
    manager: createManager(async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "config/read") {
        return {
          config: {
            apps: {
              connector_gmail: {
                enabled: true,
              },
            },
            plugins: {
              gmail: {
                enabled: true,
              },
            },
            features: {
              apps: true,
            },
          },
        };
      }

      if (method === "config/batchWrite") {
        return { ok: true };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "OpenAI Curated",
              path: "/tmp/openai-curated-marketplace.json",
              plugins: [
                {
                  id: "gmail",
                  name: "gmail",
                  installed: true,
                  enabled: false,
                  source: {
                    path: pluginRoot,
                  },
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "connector_gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: true,
              isEnabled: true,
              pluginDisplayNames: [],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "config/mcpServer/reload") {
        return { ok: true };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  await service.setPluginEnabled({
    pluginId: "gmail",
    enabled: true,
  });

  const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
  assert.deepEqual(batchWriteCall?.params, {
    edits: [
      {
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "plugins.gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "apps.connector_gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "mcp_servers.plugin-mcp.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
    ],
  });
  assert.ok(managerCalls.some((entry) => entry.method === "config/mcpServer/reload"));
});

test("setPluginEnabled disables manifest-backed apps when no other plugin still claims them", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];

  const service = new DesktopExtensionService({
    manager: createManager(async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "config/read") {
        return {
          config: {
            apps: {
              connector_gmail: {
                enabled: true,
              },
            },
            plugins: {
              gmail: {
                enabled: true,
              },
            },
            features: {
              apps: true,
            },
          },
        };
      }

      if (method === "config/batchWrite") {
        return { ok: true };
      }

      if (method === "plugin/list") {
        return {
          marketplaces: [
            {
              name: "OpenAI Curated",
              path: "/tmp/openai-curated-marketplace.json",
              plugins: [
                {
                  id: "gmail",
                  name: "gmail",
                  installed: true,
                  enabled: true,
                  source: {
                    path: pluginRoot,
                  },
                  interface: {
                    displayName: "Gmail",
                  },
                },
              ],
            },
          ],
        };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "connector_gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: true,
              isEnabled: true,
              pluginDisplayNames: [],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "config/mcpServer/reload") {
        return { ok: true };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async () => {},
    resolveProfile: async () => ({ id: "default" }),
  });

  await service.setPluginEnabled({
    pluginId: "gmail",
    enabled: false,
  });

  const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
  assert.deepEqual(batchWriteCall?.params, {
    edits: [
      {
        keyPath: "plugins.gmail.enabled",
        mergeStrategy: "upsert",
        value: false,
      },
      {
        keyPath: "apps.connector_gmail.enabled",
        mergeStrategy: "upsert",
        value: false,
      },
      {
        keyPath: "mcp_servers.plugin-mcp.enabled",
        mergeStrategy: "upsert",
        value: false,
      },
    ],
  });
  assert.ok(managerCalls.some((entry) => entry.method === "config/mcpServer/reload"));
});

test("openAppInstall enables the app and opens its install URL in the managed auth window", async () => {
  const managerCalls = [];
  const managedAuthOpened = [];
  const externallyOpened = [];

  const service = new DesktopExtensionService({
    manager: createManager(async (method, params) => {
      managerCalls.push({ method, params });

      if (method === "config/batchWrite") {
        return { ok: true };
      }

      if (method === "config/read") {
        return {
          config: {
            apps: {
              gmail: {
                enabled: true,
              },
            },
          },
        };
      }

      if (method === "plugin/list") {
        return { marketplaces: [] };
      }

      if (method === "app/list") {
        return {
          data: [
            {
              id: "gmail",
              name: "Gmail",
              installUrl: "https://chatgpt.com/gmail/install",
              isAccessible: false,
              isEnabled: true,
              pluginDisplayNames: ["Gmail"],
            },
          ],
        };
      }

      if (method === "mcpServerStatus/list") {
        return { data: [] };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async (url) => {
      externallyOpened.push(url);
    },
    openManagedAuth: async (url) => {
      managedAuthOpened.push(url);
    },
    resolveProfile: async () => ({ id: "default" }),
  });

  await service.openAppInstall({
    appId: "gmail",
    installUrl: "https://chatgpt.com/gmail/install",
  });

  const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
  assert.deepEqual(batchWriteCall?.params, {
    edits: [
      {
        keyPath: "features.apps",
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "apps.gmail.enabled",
        mergeStrategy: "upsert",
        value: true,
      },
    ],
  });
  assert.deepEqual(managedAuthOpened, ["https://chatgpt.com/gmail/install"]);
  assert.deepEqual(externallyOpened, []);
});

test("uninstallPlugin removes a profile-owned plugin directory and disables its profile entries", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const pluginRoot = path.join(codexHome, "plugins", "gmail");
  const marketplacePath = path.join(codexHome, ".agents", "plugins", "marketplace.json");
  const managerCalls = [];

  await fs.mkdir(path.join(pluginRoot, "skills", "gmail"), { recursive: true });
  await fs.mkdir(path.dirname(marketplacePath), { recursive: true });
  await fs.writeFile(path.join(pluginRoot, ".app.json"), JSON.stringify({ apps: { gmail: { id: "connector_gmail" } } }), "utf8");
  await fs.writeFile(path.join(pluginRoot, "skills", "gmail", "SKILL.md"), "# Gmail\n", "utf8");
  await fs.writeFile(
    marketplacePath,
    JSON.stringify(
      {
        name: "Profile plugins",
        plugins: [
          {
            name: "gmail",
            source: {
              path: "./plugins/gmail",
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method, params) => {
        managerCalls.push({ method, params });

        if (method === "config/batchWrite") {
          return { ok: true };
        }

        if (method === "config/read") {
          return {
            config: {
              apps: {
                connector_gmail: {
                  enabled: true,
                },
              },
              plugins: {
                gmail: {
                  enabled: true,
                },
              },
            },
          };
        }

        if (method === "plugin/list") {
          const marketplaceRecord = JSON.parse(await fs.readFile(marketplacePath, "utf8"));
          return {
            marketplaces: [
              {
                path: marketplacePath,
                plugins: (Array.isArray(marketplaceRecord.plugins) ? marketplaceRecord.plugins : []).map((entry) => ({
                  ...entry,
                  id: "gmail",
                  installed: true,
                  enabled: true,
                  source: {
                    path: pluginRoot,
                  },
                  interface: {
                    displayName: "Gmail",
                  },
                })),
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "connector_gmail",
                name: "Gmail",
                isAccessible: true,
                isEnabled: true,
                pluginDisplayNames: [],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.uninstallPlugin({ pluginId: "gmail" });

    await assert.rejects(fs.access(pluginRoot));
    assert.equal(overview.plugins.find((entry) => entry.id === "gmail"), undefined);
    assert.deepEqual(JSON.parse(await fs.readFile(marketplacePath, "utf8")).plugins, []);
    const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
    assert.deepEqual(batchWriteCall?.params, {
      edits: [
        {
          keyPath: "plugins.gmail.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
        {
          keyPath: "apps.connector_gmail.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
      ],
    });
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("uninstallPlugin prefers runtime uninstall for marketplace-installed plugins and cascades orphaned MCP state", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];

  try {
    const service = new DesktopExtensionService({
      manager: createManager(async (method, params) => {
        managerCalls.push({ method, params });

        if (method === "plugin/uninstall") {
          return {};
        }

        if (method === "config/batchWrite") {
          return { ok: true };
        }

        if (method === "config/mcpServer/reload") {
          return { ok: true };
        }

        if (method === "config/read") {
          return {
            config: {
              apps: {
                connector_gmail: {
                  enabled: true,
                },
              },
              mcp_servers: {
                "plugin-mcp": {
                  enabled: true,
                },
              },
              plugins: {
                gmail: {
                  enabled: true,
                },
              },
            },
          };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: {
                      path: pluginRoot,
                    },
                    interface: {
                      displayName: "Gmail",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "connector_gmail",
                name: "Gmail",
                isAccessible: true,
                isEnabled: true,
                pluginDisplayNames: [],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return {
            data: [
              {
                id: "plugin-mcp",
                state: "ready",
                authStatus: "connected",
                tools: [],
                resources: [],
              },
            ],
          };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    await service.uninstallPlugin({ pluginId: "gmail" });

    const runtimeUninstallCall = managerCalls.find((entry) => entry.method === "plugin/uninstall");
    assert.deepEqual(runtimeUninstallCall?.params, {
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      pluginId: "gmail",
      pluginName: "gmail",
    });
    const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
    assert.deepEqual(batchWriteCall?.params, {
      edits: [
        {
          keyPath: "plugins.gmail.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
        {
          keyPath: "apps.connector_gmail.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
        {
          keyPath: "mcp_servers.plugin-mcp.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
      ],
    });
    assert.ok(managerCalls.some((entry) => entry.method === "config/mcpServer/reload"));
  } finally {
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("setPluginEnabled preserves shared apps while disabling orphaned MCP servers", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const siblingPluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-plugin-sibling-"));
  await fs.writeFile(
    path.join(siblingPluginRoot, ".app.json"),
    JSON.stringify({
      apps: {
        gmail: {
          id: "connector_gmail",
        },
      },
    }),
    "utf8",
  );

  const managerCalls = [];

  try {
    const service = new DesktopExtensionService({
      manager: createManager(async (method, params) => {
        managerCalls.push({ method, params });

        if (method === "config/read") {
          return {
            config: {
              apps: {
                connector_gmail: {
                  enabled: true,
                },
              },
              mcp_servers: {
                "plugin-mcp": {
                  enabled: true,
                },
              },
              plugins: {
                gmail: {
                  enabled: true,
                },
                sibling: {
                  enabled: true,
                },
              },
              features: {
                apps: true,
              },
            },
          };
        }

        if (method === "config/batchWrite") {
          return { ok: true };
        }

        if (method === "config/mcpServer/reload") {
          return { ok: true };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: {
                      path: pluginRoot,
                    },
                    interface: {
                      displayName: "Gmail",
                    },
                  },
                  {
                    id: "sibling",
                    name: "sibling",
                    installed: true,
                    enabled: true,
                    source: {
                      path: siblingPluginRoot,
                    },
                    interface: {
                      displayName: "Sibling",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "app/list") {
          return {
            data: [
              {
                id: "connector_gmail",
                name: "Gmail",
                isAccessible: true,
                isEnabled: true,
                pluginDisplayNames: [],
              },
            ],
          };
        }

        if (method === "mcpServerStatus/list") {
          return {
            data: [
              {
                id: "plugin-mcp",
                state: "ready",
                authStatus: "connected",
                tools: [],
                resources: [],
              },
            ],
          };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    await service.setPluginEnabled({
      pluginId: "gmail",
      enabled: false,
    });

    const batchWriteCall = managerCalls.find((entry) => entry.method === "config/batchWrite");
    assert.deepEqual(batchWriteCall?.params, {
      edits: [
        {
          keyPath: "plugins.gmail.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
        {
          keyPath: "mcp_servers.plugin-mcp.enabled",
          mergeStrategy: "upsert",
          value: false,
        },
      ],
    });
  } finally {
    await fs.rm(pluginRoot, { force: true, recursive: true });
    await fs.rm(siblingPluginRoot, { force: true, recursive: true });
  }
});

test("readPluginDetail prefers plugin/read and falls back to local metadata", async () => {
  const pluginRoot = await createInstalledPluginFixture();

  try {
    const service = new DesktopExtensionService({
      manager: createManager(async (method, _params) => {
        if (method === "config/read") {
          return { config: { plugins: { gmail: { enabled: true } } } };
        }

        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/openai-curated-marketplace.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: {
                      path: pluginRoot,
                    },
                    interface: {
                      displayName: "Gmail",
                    },
                  },
                ],
              },
            ],
          };
        }

        if (method === "plugin/read") {
          return {
            plugin: {
              interface: {
                displayName: "Gmail",
                shortDescription: "Read and draft Gmail.",
                websiteUrl: "https://example.com/gmail",
                capabilities: ["Interactive"],
              },
              skills: [{ name: "gmail:gmail", description: "Gmail workflow" }],
              apps: [{ id: "connector_gmail" }],
              mcpServers: [{ name: "plugin-mcp" }],
            },
          };
        }

        if (method === "app/list") {
          return { data: [] };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return { data: [] };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const detail = await service.readPluginDetail({ pluginId: "gmail" });
    assert.deepEqual(detail, {
      pluginId: "gmail",
      name: "gmail",
      displayName: "Gmail",
      description: "Read and draft Gmail.",
      marketplaceName: "OpenAI Curated",
      marketplacePath: "/tmp/openai-curated-marketplace.json",
      sourcePath: pluginRoot,
      websiteUrl: "https://example.com/gmail",
      capabilities: ["Interactive"],
      skills: [
        {
          name: "gmail:gmail",
          description: "Gmail workflow",
          path: null,
        },
      ],
      apps: ["connector_gmail"],
      mcpServers: ["plugin-mcp"],
    });
  } finally {
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("startMcpServerAuth opens the returned authorization URL", async () => {
  const externallyOpened = [];
  const managedAuthOpened = [];

  const service = new DesktopExtensionService({
    manager: createManager(async (method) => {
      if (method === "mcpServer/oauth/login") {
        return {
          authorizationUrl: "https://example.com/oauth/start",
        };
      }

      if (method === "config/read") {
        return {
          config: {
            mcp_servers: {
              docs: {
                enabled: true,
              },
            },
          },
        };
      }

      if (method === "plugin/list") {
        return { marketplaces: [] };
      }

      if (method === "app/list") {
        return { data: [] };
      }

      if (method === "mcpServerStatus/list") {
        return {
          data: [
            {
              id: "docs",
              state: "pending_auth",
              authStatus: "required",
              tools: [],
              resources: [],
            },
          ],
        };
      }

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async (url) => {
      externallyOpened.push(url);
    },
    openManagedAuth: async (url) => {
      managedAuthOpened.push(url);
    },
    resolveProfile: async () => ({ id: "default" }),
  });

  const result = await service.startMcpServerAuth({ serverId: "docs" });
  assert.equal(result.authorizationUrl, "https://example.com/oauth/start");
  assert.deepEqual(externallyOpened, ["https://example.com/oauth/start"]);
  assert.deepEqual(managedAuthOpened, []);
});

test("readSkillDetail returns the skill markdown body", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const skillRoot = path.join(codexHome, "skills", "gmail");
  const skillPath = path.join(skillRoot, "SKILL.md");

  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(skillPath, "# Gmail\nDraft replies.\n", "utf8");

  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return { config: {} };
        }

        if (method === "plugin/list") {
          return { marketplaces: [] };
        }

        if (method === "app/list") {
          return { data: [] };
        }

        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }

        if (method === "skills/list") {
          return {
            data: [
              {
                cwd: codexHome,
                skills: [
                  {
                    name: "gmail",
                    path: skillPath,
                    description: "Draft replies",
                    scope: "profile",
                    enabled: true,
                  },
                ],
              },
            ],
          };
        }

        if (method === "account/read") {
          return createAccountReadResult();
        }

        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const detail = await service.readSkillDetail({ path: skillPath });
    assert.deepEqual(detail, {
      path: skillPath,
      name: "gmail",
      description: "Draft replies",
      scope: "profile",
      cwd: codexHome,
      content: "# Gmail\nDraft replies.\n",
    });
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("uninstallSkill removes a profile-owned skill directory", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const skillRoot = path.join(codexHome, "skills", "spreadsheet");
  const skillPath = path.join(skillRoot, "SKILL.md");

  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(skillPath, "# Spreadsheet\n", "utf8");

  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return { config: {} };
        }
        if (method === "plugin/list") {
          return { marketplaces: [] };
        }
        if (method === "app/list") {
          return { data: [] };
        }
        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }
        if (method === "skills/list") {
          return { data: [] };
        }
        if (method === "account/read") {
          return createAccountReadResult();
        }
        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    await service.uninstallSkill({ path: skillPath });
    await assert.rejects(fs.access(skillRoot));
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("uninstallSkill also accepts a profile-owned skill root directory", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const { codexHome } = await ensureProfileDirectories("default", env);
  const skillRoot = path.join(codexHome, "skills", "spreadsheet");
  const skillPath = path.join(skillRoot, "SKILL.md");

  await fs.mkdir(skillRoot, { recursive: true });
  await fs.writeFile(skillPath, "# Spreadsheet\n", "utf8");

  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") {
          return { config: {} };
        }
        if (method === "plugin/list") {
          return { marketplaces: [] };
        }
        if (method === "app/list") {
          return { data: [] };
        }
        if (method === "mcpServerStatus/list") {
          return { data: [] };
        }
        if (method === "skills/list") {
          return { data: [] };
        }
        if (method === "account/read") {
          return createAccountReadResult();
        }
        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    await service.uninstallSkill({ path: skillRoot });
    await assert.rejects(fs.access(skillRoot));
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

async function createInstalledPluginFixtureWithInvalidMcp() {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-plugin-bad-mcp-"));
  await fs.writeFile(
    path.join(pluginRoot, ".app.json"),
    JSON.stringify({ apps: {} }),
    "utf8",
  );
  await fs.writeFile(
    path.join(pluginRoot, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "cloudflare-api": {
          type: "http",
          url: "https://example.com/cloudflare-mcp",
        },
        "good-server": {
          url: "https://example.com/mcp",
        },
      },
    }),
    "utf8",
  );
  return pluginRoot;
}

test("getOverview surfaces failed backend reads in health.backend.failedReads without throwing", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "app/list") {
          throw new Error("App Server transport closed before response.");
        }
        if (method === "config/read") return { config: {} };
        if (method === "plugin/list") return { marketplaces: [] };
        if (method === "mcpServerStatus/list") return { data: [] };
        if (method === "skills/list") return { data: [] };
        if (method === "account/read") return createAccountReadResult();
        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });

    assert.ok(overview.health, "overview should include a health block");
    assert.equal(overview.health.backend.failedReads.length, 1);
    assert.equal(overview.health.backend.failedReads[0].method, "app/list");
    assert.match(
      overview.health.backend.failedReads[0].message,
      /App Server transport closed/,
    );
    assert.equal(overview.health.backend.lastRuntimeError, null);
    assert.deepEqual(overview.health.backend.suspectedMcpServerIds, []);
    assert.deepEqual(overview.apps, []);
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
  }
});

test("getOverview surfaces invalid plugin MCP entries without dropping valid ones", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const pluginRoot = await createInstalledPluginFixtureWithInvalidMcp();
  try {
    const service = new DesktopExtensionService({
      env,
      manager: createManager(async (method) => {
        if (method === "config/read") return { config: {} };
        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/curated.json",
                plugins: [
                  {
                    id: "cloudflare",
                    name: "cloudflare",
                    installed: true,
                    enabled: true,
                    source: { path: pluginRoot },
                    interface: { displayName: "Cloudflare" },
                  },
                ],
              },
            ],
          };
        }
        if (method === "app/list") return { data: [] };
        if (method === "mcpServerStatus/list") return { data: [] };
        if (method === "skills/list") return { data: [] };
        if (method === "account/read") return createAccountReadResult();
        throw new Error(`Unexpected method: ${method}`);
      }),
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.getOverview({ forceRefetch: true });

    const invalid = overview.health.pluginMcp.invalidEntries;
    assert.equal(invalid.length, 1);
    assert.equal(invalid[0].serverId, "cloudflare-api");
    assert.equal(invalid[0].pluginName, "cloudflare");
    assert.match(invalid[0].reason, /unsupported transport `http`/);

    const managedPlugin = findManagedExtension(overview, "plugin", "cloudflare");
    assert.ok(managedPlugin, "plugin record still present");
    assert.deepEqual(
      [...managedPlugin.includedMcpServerIds].sort(),
      ["good-server"],
      "invalid MCP entry is quarantined off the composed list; valid entry survives",
    );
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("setPluginEnabled returns health with runtime error when restart rejects", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const pluginRoot = await createInstalledPluginFixture();
  const restartReasons = [];
  try {
    const manager = {
      request: async (method) => {
        if (method === "config/read") return { config: {} };
        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/curated.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: { path: pluginRoot },
                    interface: { displayName: "Gmail" },
                  },
                ],
              },
            ],
          };
        }
        if (method === "app/list") return { data: [] };
        if (method === "mcpServerStatus/list") return { data: [] };
        if (method === "skills/list") return { data: [] };
        if (method === "account/read") return createAccountReadResult();
        if (method === "config/batchWrite") return {};
        if (method === "config/mcpServer/reload") return {};
        throw new Error(`Unexpected method: ${method}`);
      },
      restart: async (reason) => {
        restartReasons.push(reason);
        throw new Error("Invalid configuration: invalid transport in `mcp_servers.cloudflare-api`");
      },
    };

    const service = new DesktopExtensionService({
      env,
      manager,
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.setPluginEnabled({ pluginId: "gmail", enabled: true });

    assert.ok(restartReasons.includes("plugin-enabled"), "expected restart attempt");
    assert.match(
      overview.health.backend.lastRuntimeError ?? "",
      /invalid transport in `mcp_servers.cloudflare-api`/,
    );
    assert.deepEqual(overview.health.backend.suspectedMcpServerIds, ["cloudflare-api"]);
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("installPlugin surfaces runtime error in health when restart rejects post-install", async () => {
  const runtimeStateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-runtime-state-"));
  const env = {
    ...process.env,
    SENSE1_RUNTIME_STATE_ROOT: runtimeStateRoot,
  };
  const pluginRoot = await createInstalledPluginFixture();
  try {
    const manager = {
      request: async (method) => {
        if (method === "plugin/install") return { appsNeedingAuth: [] };
        if (method === "config/read") return { config: {} };
        if (method === "plugin/list") {
          return {
            marketplaces: [
              {
                name: "OpenAI Curated",
                path: "/tmp/curated.json",
                plugins: [
                  {
                    id: "gmail",
                    name: "gmail",
                    installed: true,
                    enabled: true,
                    source: { path: pluginRoot },
                    interface: { displayName: "Gmail" },
                  },
                ],
              },
            ],
          };
        }
        if (method === "app/list") return { data: [] };
        if (method === "mcpServerStatus/list") return { data: [] };
        if (method === "skills/list") return { data: [] };
        if (method === "account/read") return createAccountReadResult();
        if (method === "config/batchWrite") return {};
        if (method === "config/mcpServer/reload") return {};
        throw new Error(`Unexpected method: ${method}`);
      },
      restart: async () => {
        throw new Error("Invalid configuration: invalid transport in `mcp_servers.cloudflare-api`");
      },
    };

    const service = new DesktopExtensionService({
      env,
      manager,
      openExternal: async () => {},
      resolveProfile: async () => ({ id: "default" }),
    });

    const overview = await service.installPlugin({
      marketplacePath: "/tmp/curated.json",
      pluginId: "gmail",
      pluginName: "gmail",
    });

    assert.match(
      overview.health.backend.lastRuntimeError ?? "",
      /invalid transport in `mcp_servers.cloudflare-api`/,
    );
    assert.deepEqual(overview.health.backend.suspectedMcpServerIds, ["cloudflare-api"]);
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});
