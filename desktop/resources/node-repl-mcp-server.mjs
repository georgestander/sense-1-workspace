#!/usr/bin/env node
import vm from "node:vm";
import net from "node:net";
import os from "node:os";
import nodeProcess from "node:process";
import { clearTimeout as hostClearTimeout, setTimeout as hostSetTimeout } from "node:timers";

const MESSAGE_LENGTH_BYTES = 4;
const BROWSER_USE_PERMISSION_TIMEOUT_MS = 60_000;
const BROWSER_USE_COMMAND_TIMEOUT_MS = 30_000;
const FALLBACK_BROWSER_USE_AGENT_MARKER = "__sense1FallbackBrowserUseAgent";
const FALLBACK_BROWSER_USE_DISPLAY_MARKER = "__sense1FallbackBrowserUseDisplay";

const tools = [
  {
    name: "js",
    description: "Run JavaScript in a persistent Node-backed kernel with top-level await.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript source to execute.",
        },
        timeout_ms: {
          type: "integer",
          description: "Optional execution timeout in milliseconds.",
        },
        title: {
          type: "string",
          description: "Short description of the execution.",
        },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "js_reset",
    description: "Reset the persistent JavaScript kernel and clear all bindings created by prior js calls.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

let pendingOutput = "";
let currentMeta = {};
let responseMeta = {};
const emittedImages = [];
const pendingClientRequests = new Map();
let nextClientRequestId = 1;
let context = createContext({});

function installHostNodeReplBridge() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "nodeRepl");
  if (descriptor?.get?.name === "sense1NodeReplBridge") {
    return;
  }
  Object.defineProperty(globalThis, "nodeRepl", {
    configurable: true,
    enumerable: false,
    get: function sense1NodeReplBridge() {
      return buildNodeReplHelpers();
    },
  });
}

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

function appendConsoleOutput(values) {
  const rendered = values.map((value) => {
    if (typeof value === "string") {
      return value;
    }
    if (value instanceof Error) {
      return value.stack ?? value.message;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(" ");
  pendingOutput += `${rendered}\n`;
}

function buildReplConsole() {
  return {
    debug: (...values) => appendConsoleOutput(values),
    error: (...values) => appendConsoleOutput(values),
    info: (...values) => appendConsoleOutput(values),
    log: (...values) => appendConsoleOutput(values),
    warn: (...values) => appendConsoleOutput(values),
  };
}

async function withCapturedHostConsole(callback) {
  const previousConsole = globalThis.console;
  globalThis.console = buildReplConsole();
  try {
    return await callback();
  } finally {
    globalThis.console = previousConsole;
  }
}

async function browserUseFetch(input, init) {
  const rawUrl = typeof input === "string" || input instanceof URL
    ? String(input)
    : typeof input?.url === "string"
      ? input.url
      : "";
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.hostname === "chatgpt.com" && url.pathname === "/backend-api/aura/site_status") {
        return new Response(JSON.stringify({ feature_status: { agent: false } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {
      // Fall through to the platform fetch for non-URL inputs.
    }
  }
  return await fetch(input, init);
}

function browserUseSocketPath() {
  const overridePath = firstString(nodeProcess.env.SENSE1_BROWSER_USE_IAB_SOCKET_PATH);
  if (overridePath) {
    return overridePath;
  }
  throw new Error("SENSE1_BROWSER_USE_IAB_SOCKET_PATH is not set for Browser Use.");
}

function encodeNativePipeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const frame = Buffer.alloc(MESSAGE_LENGTH_BYTES + payload.length);
  if (os.endianness() === "LE") {
    frame.writeUInt32LE(payload.length, 0);
  } else {
    frame.writeUInt32BE(payload.length, 0);
  }
  payload.copy(frame, MESSAGE_LENGTH_BYTES);
  return frame;
}

function decodeNativePipeMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (buffer.length - offset >= MESSAGE_LENGTH_BYTES) {
    const payloadLength = os.endianness() === "LE"
      ? buffer.readUInt32LE(offset)
      : buffer.readUInt32BE(offset);
    const frameLength = MESSAGE_LENGTH_BYTES + payloadLength;
    if (buffer.length - offset < frameLength) {
      break;
    }
    messages.push(JSON.parse(buffer.subarray(offset + MESSAGE_LENGTH_BYTES, offset + frameLength).toString("utf8")));
    offset += frameLength;
  }
  return {
    messages,
    remaining: buffer.subarray(offset),
  };
}

function sendNativePipeRequest(method, params = {}, timeoutMs = BROWSER_USE_PERMISSION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(browserUseSocketPath());
    let settled = false;
    let pending = Buffer.alloc(0);
    const requestId = 1;
    const timeout = hostSetTimeout(() => {
      finish(new Error(`Timed out waiting for Browser Use native permission response to ${method}.`));
    }, timeoutMs);

    function finish(error, result) {
      if (settled) {
        return;
      }
      settled = true;
      hostClearTimeout(timeout);
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    }

    socket.on("connect", () => {
      socket.write(encodeNativePipeMessage({
        jsonrpc: "2.0",
        id: requestId,
        method,
        params,
      }));
    });
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const decoded = decodeNativePipeMessages(pending);
      pending = decoded.remaining;
      for (const message of decoded.messages) {
        if (message.id !== requestId) {
          continue;
        }
        if (message.error) {
          finish(new Error(message.error.message ?? "Browser Use native permission request failed."));
        } else {
          finish(null, message.result);
        }
        return;
      }
    });
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (!settled) {
        finish(new Error("Browser Use native permission socket closed before a response."));
      }
    });
  });
}

function browserUseElicitationOrigin(request) {
  const meta = request && typeof request === "object" && request.meta && typeof request.meta === "object"
    ? request.meta
    : {};
  if (firstString(meta.connector_id) !== "browser-use") {
    return null;
  }
  return firstString(meta.origin);
}

function browserUseTurnMetadata() {
  const metadata = currentMeta?.["x-codex-turn-metadata"];
  return metadata && typeof metadata === "object" ? metadata : {};
}

function browserUseSessionParams() {
  const metadata = browserUseTurnMetadata();
  return {
    session_id: firstString(metadata.session_id) ?? "node-repl-browser-use",
    turn_id: firstString(metadata.turn_id) ?? "node-repl-browser-use-turn",
  };
}

function browserUseOriginForUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return null;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "file:") {
      url.search = "";
      url.hash = "";
      return url.href;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function sendBrowserUseRequest(method, params = {}, timeoutMs = BROWSER_USE_COMMAND_TIMEOUT_MS) {
  return await sendNativePipeRequest(method, { ...params, ...browserUseSessionParams() }, timeoutMs);
}

async function ensureBrowserUseOriginAllowed(rawUrl) {
  const origin = browserUseOriginForUrl(rawUrl);
  if (!origin) {
    return;
  }
  const result = await createMcpElicitation({
    message: `Allow Browser Use to access ${origin}?`,
    meta: {
      codex_approval_kind: "mcp_tool_call",
      connector_id: "browser-use",
      connector_name: "Browser Use",
      origin,
      persist: "always",
      tool_params: {},
    },
  });
  if (result?.action !== "accept") {
    throw new Error(`Browser Use was not approved for ${origin}.`);
  }
}

async function browserUseTabInfo(tabId) {
  const tabs = await sendBrowserUseRequest("getTabs");
  const normalizedTabId = String(tabId);
  return Array.isArray(tabs) ? tabs.find((tab) => String(tab?.id) === normalizedTabId) : undefined;
}

function cdpResultValue(result) {
  const remoteObject = result && typeof result === "object" ? result.result : null;
  return remoteObject && typeof remoteObject === "object" ? remoteObject.value : undefined;
}

function cdpExceptionMessage(result) {
  const exceptionDetails = result && typeof result === "object" ? result.exceptionDetails : null;
  if (!exceptionDetails || typeof exceptionDetails !== "object") {
    return null;
  }
  const exception = exceptionDetails.exception;
  if (exception && typeof exception === "object") {
    return firstString(exception.description, exception.value);
  }
  return firstString(exceptionDetails.text);
}

async function evaluateBrowserUseCdp(executeCdp, expression, timeoutMs = BROWSER_USE_COMMAND_TIMEOUT_MS) {
  const result = await executeCdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, timeoutMs);
  const exceptionMessage = cdpExceptionMessage(result);
  if (exceptionMessage) {
    throw new Error(exceptionMessage);
  }
  return cdpResultValue(result);
}

function browserUseDomSnapshotExpression() {
  return `(() => {
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") return element.getAttribute("type") === "checkbox" ? "checkbox" : "textbox";
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (/^h[1-6]$/.test(tag)) return "heading";
      return tag;
    };
    const labelFor = (element) => normalize(
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      element.innerText ||
      element.textContent ||
      element.value ||
      ""
    );
    const lines = [
      \`URL: \${location.href}\`,
      \`Title: \${document.title}\`,
    ];
    const elements = Array.from(document.querySelectorAll("a,button,input,textarea,select,[role],[aria-label],[data-testid]"))
      .filter(isVisible)
      .slice(0, 200);
    for (const [index, element] of elements.entries()) {
      const label = labelFor(element);
      const href = element instanceof HTMLAnchorElement ? element.href : "";
      const testId = element.getAttribute("data-testid") || "";
      const suffix = [
        href ? \`href=\${href}\` : "",
        testId ? \`testid=\${testId}\` : "",
      ].filter(Boolean).join(" ");
      lines.push(\`[\${index}] \${roleFor(element)} \${JSON.stringify(label)}\${suffix ? \` \${suffix}\` : ""}\`);
    }
    const text = normalize(document.body?.innerText || "");
    if (text) {
      lines.push("", "Visible text:", text);
    }
    return lines.join("\\n").slice(0, 100000);
  })()`;
}

function browserUseVisibleDomExpression(includeNonInteractable = false) {
  return `(() => {
    const includeNonInteractable = ${includeNonInteractable ? "true" : "false"};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") return element.getAttribute("type") === "checkbox" ? "checkbox" : "textbox";
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (/^h[1-6]$/.test(tag)) return "heading";
      return tag;
    };
    const selectorFor = (element, index) => {
      if (element.id) return \`#\${CSS.escape(element.id)}\`;
      const testId = element.getAttribute("data-testid");
      if (testId) return \`[data-testid="\${CSS.escape(testId)}"]\`;
      return \`${"body *"}:nth-child(\${index + 1})\`;
    };
    const candidates = Array.from(document.querySelectorAll(includeNonInteractable ? "body *" : "a,button,input,textarea,select,[role],[aria-label],[data-testid]"))
      .filter(isVisible)
      .slice(0, 250);
    return {
      url: location.href,
      title: document.title,
      text: normalize(document.body?.innerText || "").slice(0, 100000),
      elements: candidates.map((element, index) => {
        const rect = element.getBoundingClientRect();
        const visibleText = normalize(element.innerText || element.textContent || element.value || "");
        return {
          node_id: String(index),
          role: roleFor(element),
          tagName: element.tagName.toLowerCase(),
          ariaName: normalize(element.getAttribute("aria-label") || element.getAttribute("alt") || element.getAttribute("title") || visibleText),
          visibleText,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          selector: { primary: selectorFor(element, index), candidates: [selectorFor(element, index)] },
        };
      }),
    };
  })()`;
}

function browserUseLocatorExpression(descriptor, action, payload = {}) {
  return `(() => {
    const descriptor = ${JSON.stringify(descriptor)};
    const action = ${JSON.stringify(action)};
    const payload = ${JSON.stringify(payload)};
    const normalize = (value) => String(value ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (element) => {
      if (!(element instanceof Element)) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const roleFor = (element) => {
      const explicit = element.getAttribute("role");
      if (explicit) return explicit;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") return element.getAttribute("type") === "checkbox" ? "checkbox" : "textbox";
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (/^h[1-6]$/.test(tag)) return "heading";
      return tag;
    };
    const elementText = (element) => normalize(
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      element.innerText ||
      element.textContent ||
      element.value ||
      ""
    );
    const matchesText = (value, expected, exact) => {
      const current = normalize(value);
      const target = normalize(expected);
      return exact ? current === target : current.toLowerCase().includes(target.toLowerCase());
    };
    let matches = [];
    if (descriptor.type === "css") {
      matches = Array.from(document.querySelectorAll(descriptor.selector));
    } else if (descriptor.type === "text") {
      matches = Array.from(document.querySelectorAll("body *")).filter((element) => matchesText(elementText(element), descriptor.text, descriptor.exact));
    } else if (descriptor.type === "role") {
      matches = Array.from(document.querySelectorAll("body *")).filter((element) => {
        if (roleFor(element) !== descriptor.role) return false;
        if (descriptor.name == null) return true;
        return matchesText(elementText(element), descriptor.name, descriptor.exact);
      });
    }
    matches = matches.filter(isVisible);
    const index = Number.isInteger(descriptor.index) ? descriptor.index : 0;
    if (action === "count") return matches.length;
    if (action === "allTextContents") return matches.map(elementText);
    const element = matches[index];
    if (!element) throw new Error("No element found for locator.");
    if (action === "text") return elementText(element);
    if (action === "attribute") return element.getAttribute(payload.name);
    if (action === "boundingBox") {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }
    if (action === "click") {
      element.scrollIntoView({ block: "center", inline: "center" });
      element.click();
      return true;
    }
    if (action === "fill") {
      element.scrollIntoView({ block: "center", inline: "center" });
      element.focus();
      element.value = String(payload.text ?? "");
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(payload.text ?? "") }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return null;
  })()`;
}

function buildBrowserUseLocator(executeCdp, descriptor) {
  const locator = {
    async count() {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "count"));
    },
    async click(options = {}) {
      await evaluateBrowserUseCdp(
        executeCdp,
        browserUseLocatorExpression(descriptor, "click"),
        typeof options?.timeoutMs === "number" ? options.timeoutMs : BROWSER_USE_COMMAND_TIMEOUT_MS,
      );
    },
    async fill(text, options = {}) {
      await evaluateBrowserUseCdp(
        executeCdp,
        browserUseLocatorExpression(descriptor, "fill", { text }),
        typeof options?.timeoutMs === "number" ? options.timeoutMs : BROWSER_USE_COMMAND_TIMEOUT_MS,
      );
    },
    async innerText() {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "text"));
    },
    async textContent() {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "text"));
    },
    async allTextContents() {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "allTextContents"));
    },
    async getAttribute(name) {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "attribute", { name }));
    },
    async boundingBox() {
      return await evaluateBrowserUseCdp(executeCdp, browserUseLocatorExpression(descriptor, "boundingBox"));
    },
    first() {
      return buildBrowserUseLocator(executeCdp, { ...descriptor, index: 0 });
    },
    nth(index) {
      return buildBrowserUseLocator(executeCdp, { ...descriptor, index });
    },
    filter() {
      return locator;
    },
    locator(selector) {
      return buildBrowserUseLocator(executeCdp, { type: "css", selector });
    },
    getByText(text, options = {}) {
      return buildBrowserUseLocator(executeCdp, {
        type: "text",
        text: String(text),
        exact: options?.exact === true,
      });
    },
    getByRole(role, options = {}) {
      return buildBrowserUseLocator(executeCdp, {
        type: "role",
        role: String(role),
        name: options?.name == null ? null : String(options.name),
        exact: options?.exact === true,
      });
    },
    async waitFor(options = {}) {
      const timeoutMs = typeof options?.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : 10_000;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        if (await locator.count() > 0) {
          return;
        }
        await new Promise((resolve) => hostSetTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for locator.");
    },
  };
  return locator;
}

function buildBrowserUseTab(tabPayload) {
  const tabId = String(tabPayload?.id ?? "");
  if (!tabId) {
    throw new Error("Browser Use tab is missing an id.");
  }
  const executeCdp = async (method, commandParams = {}, timeoutMs = BROWSER_USE_COMMAND_TIMEOUT_MS) => {
    return await sendBrowserUseRequest("executeCdp", {
      target: { tabId },
      method,
      commandParams,
    }, timeoutMs);
  };
  const tab = {
    id: tabId,
    async goto(url) {
      if (typeof url !== "string" || !url.trim()) {
        throw new Error("tab.goto requires a URL.");
      }
      await ensureBrowserUseOriginAllowed(url);
      await sendBrowserUseRequest("attach", { tabId });
      await executeCdp("Page.enable", {});
      const result = await executeCdp("Page.navigate", { url }, BROWSER_USE_COMMAND_TIMEOUT_MS);
      if (result && typeof result === "object" && typeof result.errorText === "string" && result.errorText) {
        throw new Error(result.errorText);
      }
    },
    async title() {
      return (await browserUseTabInfo(tabId))?.title;
    },
    async url() {
      return (await browserUseTabInfo(tabId))?.url;
    },
    async reload() {
      await executeCdp("Page.reload", {});
    },
    async back() {
      await executeCdp("Page.getNavigationHistory", {}).then(async (history) => {
        const currentIndex = typeof history?.currentIndex === "number" ? history.currentIndex : 0;
        const entries = Array.isArray(history?.entries) ? history.entries : [];
        const previous = entries[currentIndex - 1];
        if (previous?.id != null) {
          await executeCdp("Page.navigateToHistoryEntry", { entryId: previous.id });
        }
      });
    },
    async forward() {
      await executeCdp("Page.getNavigationHistory", {}).then(async (history) => {
        const currentIndex = typeof history?.currentIndex === "number" ? history.currentIndex : 0;
        const entries = Array.isArray(history?.entries) ? history.entries : [];
        const next = entries[currentIndex + 1];
        if (next?.id != null) {
          await executeCdp("Page.navigateToHistoryEntry", { entryId: next.id });
        }
      });
    },
    playwright: {
      async waitForLoadState(options = {}) {
        const state = options?.state === "domcontentloaded" ? "interactive" : "complete";
        const timeoutMs = typeof options?.timeoutMs === "number" && options.timeoutMs > 0
          ? options.timeoutMs
          : 10_000;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() <= deadline) {
          const result = await executeCdp("Runtime.evaluate", {
            expression: "document.readyState",
            returnByValue: true,
          }, Math.min(3_000, timeoutMs));
          const readyState = cdpResultValue(result);
          if (readyState === "complete" || (state === "interactive" && readyState === "interactive")) {
            return;
          }
          await new Promise((resolve) => hostSetTimeout(resolve, 100));
        }
        throw new Error(`Timed out waiting for ${options?.state ?? "load"}.`);
      },
      async domSnapshot() {
        return String(await evaluateBrowserUseCdp(executeCdp, browserUseDomSnapshotExpression()) ?? "");
      },
      async screenshot(options = {}) {
        const params = {
          format: "png",
          captureBeyondViewport: options?.fullPage === true,
        };
        if (options?.clip && typeof options.clip === "object") {
          params.clip = options.clip;
        }
        const result = await executeCdp("Page.captureScreenshot", params);
        const data = typeof result?.data === "string" ? result.data : "";
        return {
          mimeType: "image/png",
          toBase64() {
            return data;
          },
          toString() {
            return `data:image/png;base64,${data}`;
          },
        };
      },
      locator(selector) {
        return buildBrowserUseLocator(executeCdp, { type: "css", selector: String(selector) });
      },
      getByText(text, options = {}) {
        return buildBrowserUseLocator(executeCdp, {
          type: "text",
          text: String(text),
          exact: options?.exact === true,
        });
      },
      getByRole(role, options = {}) {
        return buildBrowserUseLocator(executeCdp, {
          type: "role",
          role: String(role),
          name: options?.name == null ? null : String(options.name),
          exact: options?.exact === true,
        });
      },
    },
    cua: {
      async get_visible_screenshot(options = {}) {
        return await tab.playwright.screenshot({ fullPage: options?.fullPage === true });
      },
    },
    dom_cua: {
      async get_visible_dom(options = {}) {
        return await evaluateBrowserUseCdp(
          executeCdp,
          browserUseVisibleDomExpression(options?.includeNonInteractable === true),
        );
      },
    },
    dev: {
      async logs() {
        return [];
      },
    },
  };
  return tab;
}

function buildBrowserUseAgent() {
  const agent = {
    browser: {
      async nameSession(name) {
        await sendBrowserUseRequest("nameSession", { name });
      },
      tabs: {
        async new() {
          return buildBrowserUseTab(await sendBrowserUseRequest("createTab"));
        },
        async selected() {
          const tabs = await sendBrowserUseRequest("getTabs");
          const selected = Array.isArray(tabs)
            ? tabs.find((tab) => tab?.active) ?? tabs[0]
            : null;
          if (!selected) {
            throw new Error("No active Browser Use tab found.");
          }
          return buildBrowserUseTab(selected);
        },
        async list() {
          const tabs = await sendBrowserUseRequest("getTabs");
          return Array.isArray(tabs) ? tabs.map((tab) => ({
            id: String(tab?.id ?? ""),
            title: typeof tab?.title === "string" ? tab.title : undefined,
            url: typeof tab?.url === "string" ? tab.url : undefined,
          })) : [];
        },
        async get(tabId) {
          const tab = await browserUseTabInfo(tabId);
          if (!tab) {
            throw new Error(`Browser Use tab not found: ${String(tabId)}`);
          }
          return buildBrowserUseTab(tab);
        },
      },
    },
  };
  Object.defineProperty(agent, FALLBACK_BROWSER_USE_AGENT_MARKER, {
    enumerable: false,
    value: true,
  });
  return agent;
}

function isFallbackBrowserUseAgent(value) {
  return !!(value && typeof value === "object" && value[FALLBACK_BROWSER_USE_AGENT_MARKER]);
}

function buildFallbackDisplay() {
  const display = async (value) => {
    if (typeof value === "string") {
      pendingOutput += `${value}\n`;
      return;
    }
    if (value && typeof value === "object" && typeof value.toBase64 === "function") {
      emittedImages.push(value);
      return;
    }
    appendConsoleOutput([value]);
  };
  Object.defineProperty(display, FALLBACK_BROWSER_USE_DISPLAY_MARKER, {
    enumerable: false,
    value: true,
  });
  return display;
}

function isFallbackBrowserUseDisplay(value) {
  return !!(typeof value === "function" && value[FALLBACK_BROWSER_USE_DISPLAY_MARKER]);
}

function codeRequestsBrowserUseSetup(code) {
  return typeof code === "string" && (
    code.includes("setupAtlasRuntime") ||
    code.includes("browser-client.mjs")
  );
}

function codeUsesBundledMarketplaceBrowserClient(code) {
  return typeof code === "string" && code.includes("/.codex/.tmp/bundled-marketplaces/");
}

function codeUsesFallbackBrowserUseAgent(code) {
  return typeof code === "string" && /\bagent\.browser\b/u.test(code);
}

function installFallbackBrowserUseGlobals(target) {
  if (!target.agent) {
    target.agent = buildBrowserUseAgent();
    target.globalThis.agent = target.agent;
  }
  if (!target.display) {
    target.display = buildFallbackDisplay();
    target.globalThis.display = target.display;
  }
}

function resetBrowserUseGlobalsForCode(code) {
  if (codeRequestsBrowserUseSetup(code)) {
    if (codeUsesBundledMarketplaceBrowserClient(code)) {
      installFallbackBrowserUseGlobals(context);
      return;
    }
    if (isFallbackBrowserUseAgent(context.agent)) {
      delete context.agent;
      delete context.globalThis.agent;
    }
    if (isFallbackBrowserUseDisplay(context.display)) {
      delete context.display;
      delete context.globalThis.display;
    }
    return;
  }

  if (codeUsesFallbackBrowserUseAgent(code)) {
    installFallbackBrowserUseGlobals(context);
  }
}

async function createMcpElicitation(request) {
  const origin = browserUseElicitationOrigin(request);
  if (origin) {
    try {
      return await sendNativePipeRequest("requestPermission", {
        origin,
        message: firstString(request?.message),
        session_id: firstString(currentMeta?.["x-codex-turn-metadata"]?.session_id),
        turn_id: firstString(currentMeta?.["x-codex-turn-metadata"]?.turn_id),
        timeoutMs: BROWSER_USE_PERMISSION_TIMEOUT_MS,
      });
    } catch {
      return { action: "decline" };
    }
  }
  return await sendClientRequest("elicitation/create", request);
}

function createContext(requestMeta) {
  installHostNodeReplBridge();
  pendingOutput = "";
  currentMeta = requestMeta ?? {};
  responseMeta = {};
  emittedImages.length = 0;

  const sandbox = {
    Buffer,
    URL,
    URLSearchParams,
    atob,
    btoa,
    clearImmediate,
    clearInterval,
    clearTimeout,
    console: buildReplConsole(),
    fetch: browserUseFetch,
    Response,
    setImmediate,
    setInterval,
    setTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  sandbox.nodeRepl = buildNodeReplHelpers();
  return vm.createContext(sandbox);
}

function buildNodeReplHelpers() {
  return {
    get cwd() {
      return nodeProcess.cwd();
    },
    get homeDir() {
      return nodeProcess.env.HOME ?? nodeProcess.cwd();
    },
    get tmpDir() {
      return nodeProcess.env.TMPDIR ?? "/tmp";
    },
    get requestMeta() {
      return currentMeta;
    },
    fetch: browserUseFetch,
    createElicitation: createMcpElicitation,
    write(text) {
      pendingOutput += String(text);
    },
    emitImage(imageLike) {
      emittedImages.push(imageLike);
    },
    setResponseMeta(meta) {
      if (meta && typeof meta === "object") {
        responseMeta = { ...responseMeta, ...meta };
      }
    },
  };
}

function resetRequestState(requestMeta, code) {
  installHostNodeReplBridge();
  pendingOutput = "";
  currentMeta = requestMeta ?? {};
  responseMeta = {};
  emittedImages.length = 0;
  context.nodeRepl = buildNodeReplHelpers();
  context.globalThis = context;
  context.global = context;
  context.globalThis.nodeRepl = context.nodeRepl;
  resetBrowserUseGlobalsForCode(code);
}

async function runJavaScript(code, requestMeta, timeoutMs) {
  resetRequestState(requestMeta, code);
  const effectiveTimeoutMs = timeoutMs ?? 30_000;
  const wrapped = `(async () => {\n${code}\n})()`;
  const script = new vm.Script(wrapped, {
    filename: "node_repl.js",
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
  const execution = withCapturedHostConsole(() => script.runInContext(context, { timeout: effectiveTimeoutMs }));
  let executionTimeout = null;
  try {
    return await Promise.race([
      execution,
      new Promise((_, reject) => {
        executionTimeout = hostSetTimeout(
          () => reject(new Error(`JavaScript execution timed out after ${effectiveTimeoutMs}ms.`)),
          effectiveTimeoutMs,
        );
      }),
    ]);
  } finally {
    if (executionTimeout) {
      hostClearTimeout(executionTimeout);
    }
  }
}

function textResult(text, extra = {}) {
  return {
    content: [{ type: "text", text }],
    ...extra,
  };
}

function extractRequestMeta(params) {
  const candidate = params?._meta ?? params?.arguments?._meta;
  return candidate && typeof candidate === "object" ? candidate : {};
}

async function handleRequest(message) {
  const { id, method, params = {} } = message;
  if (id == null) {
    return;
  }

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "node_repl", version: "0.1.0" },
      },
    });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools } });
    return;
  }

  if (method === "tools/call") {
    try {
      const toolName = params.name;
      const args = params.arguments && typeof params.arguments === "object" ? params.arguments : {};
      if (toolName === "js_reset") {
        context = createContext(extractRequestMeta(params));
        send({ jsonrpc: "2.0", id, result: textResult("Node REPL reset.") });
        return;
      }
      if (toolName !== "js") {
        throw new Error(`Unknown tool: ${String(toolName)}`);
      }
      const code = typeof args.code === "string" ? args.code : "";
      if (!code.trim()) {
        throw new Error("JavaScript source is required.");
      }
      const timeoutMs = typeof args.timeout_ms === "number" ? args.timeout_ms : undefined;
      const result = await runJavaScript(code, extractRequestMeta(params), timeoutMs);
      const text = pendingOutput || (result === undefined ? "" : String(result));
      send({
        jsonrpc: "2.0",
        id,
        result: textResult(text, Object.keys(responseMeta).length > 0 ? { _meta: responseMeta } : {}),
      });
      return;
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id,
        result: textResult(error instanceof Error ? error.stack ?? error.message : String(error), { isError: true }),
      });
      return;
    }
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

function send(message) {
  nodeProcess.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendClientRequest(method, params = {}) {
  const id = nextClientRequestId++;
  send({ jsonrpc: "2.0", id, method, params });
  return new Promise((resolve, reject) => {
    const timeout = hostSetTimeout(() => {
      const pending = pendingClientRequests.get(id);
      if (!pending) {
        return;
      }
      pendingClientRequests.delete(id);
      reject(new Error(`Timed out waiting for MCP client response to ${method}.`));
    }, 60_000);
    pendingClientRequests.set(id, { resolve, reject, timeout });
  });
}

function handleClientResponse(message) {
  if (message.id == null || message.method) {
    return false;
  }
  const pending = pendingClientRequests.get(message.id);
  if (!pending) {
    return false;
  }
  pendingClientRequests.delete(message.id);
  hostClearTimeout(pending.timeout);
  if (message.error) {
    pending.reject(new Error(message.error.message ?? "MCP client request failed."));
  } else {
    pending.resolve(message.result);
  }
  return true;
}

let buffer = "";
nodeProcess.stdin.setEncoding("utf8");
nodeProcess.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (line) {
      try {
        const message = JSON.parse(line);
        if (!handleClientResponse(message)) {
          void handleRequest(message);
        }
      } catch (error) {
        console.error(error);
      }
    }
    newlineIndex = buffer.indexOf("\n");
  }
});
