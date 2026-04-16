/**
 * Shared classifier for MCP server entries declared by plugins (in their
 * `.mcp.json`) or by the user's `config.toml`. Codex accepts exactly three
 * transports and the field that names them is `type` (JSON) or `transport`
 * (TOML). Anything else is an invalid entry that will crash the codex
 * app-server on startup.
 *
 * Consumers:
 *   - `desktop-extension-service.ts` surfaces invalid entries on
 *     `health.pluginMcp.invalidEntries`.
 *   - `plugin-mcp-quarantine.ts` strips invalid entries from `.mcp.json`
 *     and records them in the quarantine manifest.
 */

export type McpServerClassification =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

const MCP_STDIO_TRANSPORTS = new Set(["stdio"]);
const MCP_REMOTE_TRANSPORTS = new Set(["sse", "streamable_http", "streamable-http"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstNonEmptyString(...candidates: readonly unknown[]): string | null {
  for (const candidate of candidates) {
    const resolved = nonEmptyString(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

export function classifyMcpServerEntry(entry: unknown): McpServerClassification {
  const record = asRecord(entry);
  if (Object.keys(record).length === 0) {
    return { ok: false, reason: "Plugin MCP entry is not an object." };
  }
  const command = nonEmptyString(record.command);
  const url = nonEmptyString(record.url);
  const declaredType = firstNonEmptyString(record.type, record.transport);
  const declaredTypeLower = declaredType ? declaredType.toLowerCase() : null;

  if (declaredTypeLower) {
    if (MCP_STDIO_TRANSPORTS.has(declaredTypeLower)) {
      if (!command) {
        return {
          ok: false,
          reason: `Plugin MCP entry declares transport \`${declaredType}\` but is missing \`command\`.`,
        };
      }
      return { ok: true };
    }
    if (MCP_REMOTE_TRANSPORTS.has(declaredTypeLower)) {
      if (!url) {
        return {
          ok: false,
          reason: `Plugin MCP entry declares transport \`${declaredType}\` but is missing \`url\`.`,
        };
      }
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Plugin MCP entry declares unsupported transport \`${declaredType}\`; codex accepts \`stdio\`, \`sse\`, or \`streamable_http\`.`,
    };
  }

  if (command) {
    return { ok: true };
  }
  if (url) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: "Plugin MCP entry is missing both `command` (stdio) and `url` (remote); codex cannot infer a transport.",
  };
}
