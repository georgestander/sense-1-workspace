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
  await fs.mkdir(path.join(pluginRoot, "skills", "gmail"), { recursive: true });
  await fs.writeFile(path.join(pluginRoot, "skills", "gmail", "SKILL.md"), "# Gmail\n", "utf8");
  return pluginRoot;
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
  } finally {
    await fs.rm(runtimeStateRoot, { force: true, recursive: true });
    await fs.rm(pluginRoot, { force: true, recursive: true });
  }
});

test("installPlugin enables manifest-backed apps even when plugin/install omits app ids", async () => {
  const pluginRoot = await createInstalledPluginFixture();
  const managerCalls = [];
  const opened = [];
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

      if (method === "skills/list") {
        return { data: [] };
      }

      if (method === "account/read") {
        return createAccountReadResult();
      }

      throw new Error(`Unexpected method: ${method}`);
    }),
    openExternal: async (url) => {
      opened.push(url);
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
    ],
  });
  assert.deepEqual(opened, ["https://chatgpt.com/gmail/install"]);
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
        keyPath: 'plugins.gmail@openai-curated.enabled',
        mergeStrategy: "upsert",
        value: true,
      },
      {
        keyPath: "apps.connector_gmail.enabled",
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
    ],
  });
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
    ],
  });
});

test("openAppInstall enables the app and opens its install URL", async () => {
  const managerCalls = [];
  const opened = [];

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
      opened.push(url);
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
  assert.deepEqual(opened, ["https://chatgpt.com/gmail/install"]);
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
