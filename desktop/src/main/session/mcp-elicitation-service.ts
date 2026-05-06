import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";

const DEFAULT_MCP_ELICITATION_TIMEOUT_MS = 60_000;

type JsonRecord = Record<string, unknown>;

type McpServerElicitationRequest = {
  readonly id?: number;
  readonly method?: string;
  readonly params?: JsonRecord | null;
};

type BrowserUsePermissionService = {
  requestBrowserUsePermission(
    threadId: string,
    origin: string,
    timeoutMs?: number,
  ): Promise<"accept" | "decline">;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function firstString(...values: unknown[]): string | null {
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

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function browserUseElicitationOrigin(params: JsonRecord | null): string | null {
  const meta = asRecord(params?._meta);
  const toolParams = asRecord(meta?.tool_params) ?? asRecord(meta?.toolParams);
  return firstString(
    meta?.origin,
    toolParams?.origin,
    params?.mode === "url" ? params.url : null,
  );
}

function isBrowserUseElicitation(params: JsonRecord | null): boolean {
  const meta = asRecord(params?._meta);
  const connectorId = firstString(meta?.connector_id, meta?.connectorId);
  if (connectorId === "browser-use") {
    return true;
  }
  const connectorName = firstString(meta?.connector_name, meta?.connectorName);
  if (connectorName?.toLowerCase() === "browser use") {
    return true;
  }
  const message = firstString(params?.message);
  return Boolean(
    browserUseElicitationOrigin(params)
      && firstString(params?.serverName) === "node_repl"
      && message?.toLowerCase().includes("browser use"),
  );
}

function codeFromMcpToolCall(params: JsonRecord | null): string | null {
  const meta = asRecord(params?._meta);
  const toolParams = asRecord(meta?.tool_params) ?? asRecord(meta?.toolParams);
  const directCode = firstString(toolParams?.code);
  if (directCode) {
    return directCode;
  }
  const displayItems = Array.isArray(meta?.tool_params_display) ? meta.tool_params_display : [];
  for (const item of displayItems) {
    const record = asRecord(item);
    if (firstString(record?.name) === "code") {
      return firstString(record?.value);
    }
  }
  return null;
}

function isBrowserUseMcpToolCall(params: JsonRecord | null): boolean {
  const meta = asRecord(params?._meta);
  if (firstString(params?.serverName) !== "node_repl") {
    return false;
  }
  if (firstString(meta?.codex_approval_kind) !== "mcp_tool_call") {
    return false;
  }
  const message = firstString(params?.message)?.toLowerCase() ?? "";
  if (message.includes("js_reset")) {
    return true;
  }
  const code = codeFromMcpToolCall(params);
  if (!code) {
    return false;
  }
  return code.includes("browser-client.mjs")
    || code.includes("setupAtlasRuntime")
    || code.includes("agent.browser")
    || /\bglobalThis\.tab\b/u.test(code)
    || /\btab\.(?:back|clipboard|close|cua|dev|dom_cua|forward|goto|playwright|reload|title|url)\b/u.test(code);
}

function timeoutFromParams(params: JsonRecord | null): number {
  const meta = asRecord(params?._meta);
  return numberParam(meta?.timeoutMs, DEFAULT_MCP_ELICITATION_TIMEOUT_MS);
}

function respondWithAction(
  manager: AppServerProcessManager,
  requestId: number,
  action: "accept" | "decline" | "cancel",
): void {
  manager.respond(requestId, {
    action,
    content: null,
    _meta: null,
  });
}

export function isMcpServerElicitationRequest(message: unknown): message is McpServerElicitationRequest {
  const record = asRecord(message);
  return record?.method === "mcpServer/elicitation/request" && typeof record.id === "number";
}

export async function handleMcpServerElicitationRequest({
  browser,
  manager,
  message,
}: {
  browser: BrowserUsePermissionService;
  manager: AppServerProcessManager;
  message: McpServerElicitationRequest;
}): Promise<void> {
  const requestId = message.id;
  if (typeof requestId !== "number") {
    return;
  }

  const params = asRecord(message.params);
  if (isBrowserUseMcpToolCall(params)) {
    respondWithAction(manager, requestId, "accept");
    return;
  }
  if (!isBrowserUseElicitation(params)) {
    respondWithAction(manager, requestId, "cancel");
    return;
  }

  const threadId = firstString(params?.threadId);
  const origin = browserUseElicitationOrigin(params);
  if (!threadId || !origin) {
    respondWithAction(manager, requestId, "decline");
    return;
  }

  try {
    const decision = await browser.requestBrowserUsePermission(threadId, origin, timeoutFromParams(params));
    respondWithAction(manager, requestId, decision);
  } catch {
    respondWithAction(manager, requestId, "decline");
  }
}
