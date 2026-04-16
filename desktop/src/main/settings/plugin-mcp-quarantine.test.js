import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  classifyPluginMcpEntry,
  quarantineInvalidPluginMcpEntries,
  readQuarantinedPluginMcpEntries,
} from "./plugin-mcp-quarantine.ts";

async function makeProfile() {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-quarantine-"));
  const clonesRoot = path.join(codexHome, ".tmp", "plugins", "plugins");
  await fs.mkdir(clonesRoot, { recursive: true });
  return { codexHome, clonesRoot };
}

async function writePluginMcp(clonesRoot, pluginName, contents) {
  const sourcePath = path.join(clonesRoot, pluginName);
  await fs.mkdir(sourcePath, { recursive: true });
  const mcpJsonPath = path.join(sourcePath, ".mcp.json");
  await fs.writeFile(mcpJsonPath, JSON.stringify(contents, null, 2), "utf8");
  return { sourcePath, mcpJsonPath };
}

test("classifyPluginMcpEntry accepts stdio command entries and rejects transportless ones", () => {
  assert.equal(classifyPluginMcpEntry({ command: "node", args: ["server.js"] }).ok, true);
  assert.equal(classifyPluginMcpEntry({ url: "https://example.com/mcp" }).ok, true);
  assert.equal(classifyPluginMcpEntry({ type: "http" }).ok, false);
  assert.equal(classifyPluginMcpEntry({}).ok, false);
  assert.equal(classifyPluginMcpEntry(null).ok, false);
});

test("quarantine leaves plugins with only valid entries untouched", async () => {
  const { codexHome, clonesRoot } = await makeProfile();
  try {
    const { mcpJsonPath } = await writePluginMcp(clonesRoot, "gmail", {
      mcpServers: {
        "gmail-mcp": { url: "https://example.com/mcp" },
      },
    });

    const summary = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(summary.scannedFiles, 1);
    assert.equal(summary.rewrittenFiles, 0);
    assert.deepEqual(summary.removedEntries, []);

    const onDisk = JSON.parse(await fs.readFile(mcpJsonPath, "utf8"));
    assert.deepEqual(onDisk.mcpServers, {
      "gmail-mcp": { url: "https://example.com/mcp" },
    });

    const manifestPath = path.join(path.dirname(mcpJsonPath), ".mcp.json.quarantine-manifest.json");
    await assert.rejects(fs.access(manifestPath), "no manifest created when nothing quarantined");
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});

test("quarantine strips invalid entries, preserves valid ones, and records a manifest", async () => {
  const { codexHome, clonesRoot } = await makeProfile();
  try {
    const { sourcePath, mcpJsonPath } = await writePluginMcp(clonesRoot, "cloudflare", {
      mcpServers: {
        "cloudflare-api": { type: "http" },
        "good-server": { url: "https://example.com/mcp" },
      },
    });

    const summary = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(summary.scannedFiles, 1);
    assert.equal(summary.rewrittenFiles, 1);
    assert.equal(summary.removedEntries.length, 1);
    assert.equal(summary.removedEntries[0].serverId, "cloudflare-api");
    assert.equal(summary.removedEntries[0].pluginName, "cloudflare");
    assert.equal(summary.removedEntries[0].sourcePath, sourcePath);

    const onDisk = JSON.parse(await fs.readFile(mcpJsonPath, "utf8"));
    assert.deepEqual(onDisk.mcpServers, {
      "good-server": { url: "https://example.com/mcp" },
    });

    const manifest = JSON.parse(await fs.readFile(path.join(sourcePath, ".mcp.json.quarantine-manifest.json"), "utf8"));
    assert.equal(manifest.entries.length, 1);
    assert.equal(manifest.entries[0].serverId, "cloudflare-api");
    assert.deepEqual(manifest.entries[0].originalValue, { type: "http" });
    assert.ok(manifest.entries[0].removedAt);
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});

test("quarantine is idempotent across repeated runs", async () => {
  const { codexHome, clonesRoot } = await makeProfile();
  try {
    const { sourcePath } = await writePluginMcp(clonesRoot, "cloudflare", {
      mcpServers: {
        "cloudflare-api": { type: "http" },
        "good-server": { url: "https://example.com/mcp" },
      },
    });

    const first = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(first.rewrittenFiles, 1);

    const second = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(second.rewrittenFiles, 0);
    assert.deepEqual(second.removedEntries, []);

    const manifest = JSON.parse(await fs.readFile(path.join(sourcePath, ".mcp.json.quarantine-manifest.json"), "utf8"));
    assert.equal(manifest.entries.length, 1);
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});

test("readQuarantinedPluginMcpEntries reports past quarantined entries", async () => {
  const { codexHome, clonesRoot } = await makeProfile();
  try {
    await writePluginMcp(clonesRoot, "cloudflare", {
      mcpServers: {
        "cloudflare-api": { type: "http" },
      },
    });

    await quarantineInvalidPluginMcpEntries(codexHome);
    const issues = await readQuarantinedPluginMcpEntries(codexHome);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].serverId, "cloudflare-api");
    assert.equal(issues[0].pluginName, "cloudflare");
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});

test("quarantine tolerates a missing clones directory", async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), "sense1-quarantine-empty-"));
  try {
    const summary = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(summary.scannedFiles, 0);
    assert.equal(summary.rewrittenFiles, 0);
    assert.deepEqual(summary.removedEntries, []);
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});

test("quarantine tolerates unparseable .mcp.json files without throwing", async () => {
  const { codexHome, clonesRoot } = await makeProfile();
  try {
    const pluginDir = path.join(clonesRoot, "broken");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, ".mcp.json"), "{ not-json", "utf8");

    const summary = await quarantineInvalidPluginMcpEntries(codexHome);
    assert.equal(summary.scannedFiles, 1);
    assert.equal(summary.rewrittenFiles, 0);
  } finally {
    await fs.rm(codexHome, { force: true, recursive: true });
  }
});
