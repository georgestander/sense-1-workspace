import type { AppServerProcessManager } from "../runtime/app-server-process-manager.js";

const DEFAULT_DYNAMIC_TOOL_TIMEOUT_MS = 90_000;

type JsonRecord = Record<string, unknown>;

type DynamicToolCallRequest = {
  readonly id?: number;
  readonly method?: string;
  readonly params?: JsonRecord | null;
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

function resolveMcpServerName(namespace: string | null, tool: string | null): { server: string; tool: string } | null {
  if (namespace?.startsWith("mcp__") && namespace.endsWith("__") && tool) {
    const server = namespace.slice("mcp__".length, -2);
    return server ? { server, tool } : null;
  }

  const fullToolMatch = tool?.match(/^mcp__(.+?)__(.+)$/u);
  if (fullToolMatch?.[1] && fullToolMatch[2]) {
    return {
      server: fullToolMatch[1],
      tool: fullToolMatch[2],
    };
  }

  return null;
}

function contentItemFromMcpContent(content: unknown): JsonRecord {
  const record = asRecord(content);
  if (record?.type === "text" && typeof record.text === "string") {
    return { type: "inputText", text: record.text };
  }
  if (record?.type === "image" && typeof record.data === "string") {
    const mimeType = firstString(record.mimeType, record.mime_type) ?? "image/png";
    return { type: "inputImage", imageUrl: `data:${mimeType};base64,${record.data}` };
  }
  return {
    type: "inputText",
    text: typeof content === "string" ? content : JSON.stringify(content) ?? "",
  };
}

function contentItemsFromMcpResult(result: unknown): JsonRecord[] {
  const record = asRecord(result);
  const content = Array.isArray(record?.content) ? record.content : [];
  return content.map(contentItemFromMcpContent);
}

function timeoutForArguments(argumentsValue: unknown): number {
  const args = asRecord(argumentsValue);
  const requestedTimeout = typeof args?.timeout_ms === "number" && Number.isFinite(args.timeout_ms)
    ? args.timeout_ms
    : 0;
  return Math.max(DEFAULT_DYNAMIC_TOOL_TIMEOUT_MS, requestedTimeout + 15_000);
}

export function isDynamicToolCallRequest(message: unknown): message is DynamicToolCallRequest {
  const record = asRecord(message);
  return record?.method === "item/tool/call" && typeof record.id === "number";
}

export async function handleDynamicToolCallRequest({
  manager,
  message,
}: {
  manager: AppServerProcessManager;
  message: DynamicToolCallRequest;
}): Promise<void> {
  const requestId = message.id;
  if (typeof requestId !== "number") {
    return;
  }

  const params = asRecord(message.params);
  const threadId = firstString(params?.threadId);
  const turnId = firstString(params?.turnId);
  const namespace = firstString(params?.namespace);
  const tool = firstString(params?.tool);
  const mcpTool = resolveMcpServerName(namespace, tool);
  if (!threadId || !turnId || !tool || !mcpTool) {
    manager.respond(requestId, {
      contentItems: [{
        type: "inputText",
        text: `Unsupported dynamic tool call: ${namespace ? `${namespace}.` : ""}${tool ?? "unknown"}`,
      }],
      success: false,
    });
    return;
  }

  const argumentsValue = params?.arguments ?? {};
  try {
    const result = await manager.request(
      "mcpServer/tool/call",
      {
        threadId,
        server: mcpTool.server,
        tool: mcpTool.tool,
        arguments: argumentsValue,
        _meta: {
          "x-codex-turn-metadata": {
            session_id: threadId,
            turn_id: turnId,
          },
        },
      },
      timeoutForArguments(argumentsValue),
    );
    const resultRecord = asRecord(result);
    manager.respond(requestId, {
      contentItems: contentItemsFromMcpResult(result),
      success: resultRecord?.isError !== true,
    });
  } catch (error) {
    manager.respond(requestId, {
      contentItems: [{
        type: "inputText",
        text: error instanceof Error ? error.message : String(error),
      }],
      success: false,
    });
  }
}
