import { useCallback, useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";

import type {
  DesktopBrowserBounds,
  DesktopBrowserScreenshotResult,
  DesktopBrowserState,
  DesktopBrowserTrustCheckResult,
  DesktopBrowserViewportPreset,
} from "../../../main/contracts";
import { Button } from "../ui/button";
import { ThreadBrowserToolbar } from "./ThreadBrowserToolbar.js";

interface ThreadBrowserPaneProps {
  threadId: string;
  submitSelectedThreadPrompt: (threadPrompt: string) => Promise<boolean>;
  onClose: () => void;
}

interface StoredThreadBrowserState {
  readonly url: string | null;
  readonly viewport: DesktopBrowserViewportPreset;
}

type InteractionMode = "none" | "comment" | "click" | "type";

const STORAGE_KEY = "sense1.thread-browser.v1";
const DEFAULT_URL = "about:blank";

export function ThreadBrowserPane({ threadId, submitSelectedThreadPrompt, onClose }: ThreadBrowserPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<DesktopBrowserState | null>(null);
  const [address, setAddress] = useState(DEFAULT_URL);
  const [viewport, setViewport] = useState<DesktopBrowserViewportPreset>("desktop");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");
  const [commentText, setCommentText] = useState("");
  const [typeText, setTypeText] = useState("");
  const [lastScreenshot, setLastScreenshot] = useState<DesktopBrowserScreenshotResult | null>(null);
  const [trustCheck, setTrustCheck] = useState<DesktopBrowserTrustCheckResult | null>(null);

  const activeUrl = state?.url ?? address;
  const canUseBrowser = trustCheck?.status === "allowed";
  const needsTrust = trustCheck?.status === "needsApproval";
  const blocked = trustCheck?.status === "blocked";

  const rememberState = useCallback((nextState: DesktopBrowserState | null, nextViewport: DesktopBrowserViewportPreset) => {
    const current = readStoredBrowserState();
    current[threadId] = {
      url: nextState?.url ?? null,
      viewport: nextViewport,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }, [threadId]);

  const measureBounds = useCallback((): DesktopBrowserBounds | null => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const syncBounds = useCallback(async () => {
    const bounds = measureBounds();
    if (!bounds) {
      return;
    }
    await window.sense1Desktop.browser.setBounds({ threadId, bounds });
  }, [measureBounds, threadId]);

  useEffect(() => {
    const stored = readStoredBrowserState()[threadId];
    const initialViewport = stored?.viewport ?? "desktop";
    const initialUrl = stored?.url ?? DEFAULT_URL;
    setViewport(initialViewport);
    setAddress(initialUrl);
    const bounds = measureBounds();
    if (!bounds) {
      return;
    }
    let cancelled = false;
    void window.sense1Desktop.browser
      .open({ threadId, bounds, url: initialUrl, viewport: initialViewport })
      .then((nextState) => {
        if (cancelled) return;
        setState(nextState);
        setAddress(nextState.url ?? initialUrl);
        rememberState(nextState, initialViewport);
      })
      .catch((error) => {
        if (!cancelled) setStatusText(error instanceof Error ? error.message : "Unable to open browser.");
      });
    return () => {
      cancelled = true;
      void window.sense1Desktop.browser.close({ threadId });
    };
  }, [measureBounds, rememberState, threadId]);

  useEffect(() => {
    const target = hostRef.current;
    if (!target) {
      return;
    }
    const observer = new ResizeObserver(() => {
      void syncBounds();
    });
    observer.observe(target);
    window.addEventListener("resize", syncBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBounds);
    };
  }, [syncBounds]);

  useEffect(() => {
    if (!activeUrl) {
      setTrustCheck(null);
      return;
    }
    let cancelled = false;
    void window.sense1Desktop.browser.checkTrust({ url: activeUrl }).then((result) => {
      if (!cancelled) setTrustCheck(result);
    });
    return () => {
      cancelled = true;
    };
  }, [activeUrl]);

  async function navigate() {
    setStatusText(null);
    const nextState = await window.sense1Desktop.browser.navigate({ threadId, url: address });
    setState(nextState);
    setAddress(nextState.url ?? address);
    rememberState(nextState, viewport);
  }

  async function updateViewport(nextViewport: DesktopBrowserViewportPreset) {
    const bounds = measureBounds();
    if (!bounds) return;
    setViewport(nextViewport);
    const nextState = await window.sense1Desktop.browser.setViewport({ threadId, viewport: nextViewport, bounds });
    setState(nextState);
    rememberState(nextState, nextViewport);
  }

  async function captureScreenshot() {
    const screenshot = await window.sense1Desktop.browser.screenshot({ threadId });
    setLastScreenshot(screenshot);
    setStatusText("Screenshot captured.");
  }

  async function inspectPage() {
    if (!(await ensureTrusted())) {
      return;
    }
    const result = await window.sense1Desktop.browser.inspect({ threadId });
    const evidence = [
      "@Browser inspection",
      `URL: ${result.url ?? "unknown"}`,
      `Title: ${result.title ?? "unknown"}`,
      "",
      result.text.slice(0, 3000) || "No readable page text found.",
    ].join("\n");
    await submitSelectedThreadPrompt(evidence);
  }

  async function sendScreenshotEvidence() {
    const screenshot = lastScreenshot ?? await window.sense1Desktop.browser.screenshot({ threadId });
    setLastScreenshot(screenshot);
    await submitSelectedThreadPrompt([
      "@Browser screenshot evidence",
      `URL: ${screenshot.url ?? "unknown"}`,
      `Title: ${screenshot.title ?? "unknown"}`,
      `Captured: ${screenshot.capturedAt}`,
      "Screenshot captured in the Sense-1 in-app browser.",
    ].join("\n"));
  }

  async function ensureTrusted(): Promise<boolean> {
    const check = await window.sense1Desktop.browser.checkTrust({ url: activeUrl || address });
    setTrustCheck(check);
    if (check.status === "allowed") {
      return true;
    }
    if (check.status === "blocked") {
      setStatusText("This origin is blocked for Browser Use.");
      return false;
    }
    if (check.status === "needsApproval") {
      setStatusText("Allow this origin before Browser Use can inspect or operate it.");
      return false;
    }
    setStatusText(check.message ?? "Browser Use is unavailable for this page.");
    return false;
  }

  async function updateTrust(decision: "allowOnce" | "alwaysAllow" | "block") {
    if (!trustCheck?.origin) {
      return;
    }
    const trustState = await window.sense1Desktop.browser.updateTrust({ origin: trustCheck.origin, decision });
    const nextCheck = await window.sense1Desktop.browser.checkTrust({ url: activeUrl || address });
    setTrustCheck(nextCheck);
    setStatusText(`${trustState.allowedOrigins.length} allowed, ${trustState.blockedOrigins.length} blocked.`);
  }

  async function handleViewportClick(event: React.MouseEvent<HTMLElement>) {
    if (interactionMode === "none") {
      return;
    }
    const bounds = hostRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    const x = Math.round(event.clientX - bounds.x);
    const y = Math.round(event.clientY - bounds.y);
    if (interactionMode === "comment") {
      const text = commentText.trim();
      if (!text) {
        setStatusText("Write a comment before placing it on the page.");
        return;
      }
      await submitSelectedThreadPrompt([
        "@Browser page comment",
        `URL: ${activeUrl ?? "unknown"}`,
        `Point: ${x},${y}`,
        "",
        text,
      ].join("\n"));
      setCommentText("");
      setInteractionMode("none");
      return;
    }
    if (!(await ensureTrusted())) {
      return;
    }
    if (interactionMode === "click") {
      setState(await window.sense1Desktop.browser.click({ threadId, x, y }));
      setInteractionMode("none");
      return;
    }
    const text = typeText;
    if (!text) {
      setStatusText("Enter text before using Browser Use type.");
      return;
    }
    setState(await window.sense1Desktop.browser.type({ threadId, x, y, text }));
    setInteractionMode("none");
  }

  return (
    <aside className="flex min-h-0 w-[48%] min-w-[420px] flex-col border-l border-line bg-surface-high">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Button aria-label="Close browser" className="h-8 w-8 px-0" onClick={onClose} type="button" variant="secondary">
          <X className="size-4" />
        </Button>
      </div>

      <ThreadBrowserToolbar
        address={address}
        blocked={blocked}
        canUseBrowser={canUseBrowser}
        interactionMode={interactionMode}
        onAddressChange={setAddress}
        onCaptureScreenshot={() => void captureScreenshot()}
        onInspectPage={() => void inspectPage()}
        onNavigate={() => void navigate()}
        onOpenExternal={() => activeUrl && void window.sense1Desktop.window.openExternalUrl(activeUrl)}
        onSendEvidence={() => void sendScreenshotEvidence()}
        onSetInteractionMode={setInteractionMode}
        onStateChange={setState}
        onUpdateViewport={(nextViewport) => void updateViewport(nextViewport)}
        state={state}
        threadId={threadId}
        viewport={viewport}
      />

      {trustCheck?.origin && needsTrust ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-soft px-3 py-2 text-xs text-ink-soft">
          <span className="min-w-0 flex-1 truncate">Allow Browser Use on {trustCheck.origin}?</span>
          <Button className="h-7 px-2 text-[0.7rem]" onClick={() => void updateTrust("allowOnce")} type="button" variant="secondary">Allow once</Button>
          <Button className="h-7 px-2 text-[0.7rem]" onClick={() => void updateTrust("alwaysAllow")} type="button" variant="secondary">Always</Button>
          <Button className="h-7 px-2 text-[0.7rem]" onClick={() => void updateTrust("block")} type="button" variant="secondary">Block</Button>
        </div>
      ) : null}

      {interactionMode === "comment" || interactionMode === "type" ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-high px-3 py-1.5 text-sm outline-none"
            onChange={(event) => interactionMode === "comment" ? setCommentText(event.target.value) : setTypeText(event.target.value)}
            placeholder={interactionMode === "comment" ? "Comment, then click the page..." : "Text to type, then click target..."}
            value={interactionMode === "comment" ? commentText : typeText}
          />
          {interactionMode !== "comment" ? null : (
            <Button className="h-8 px-2 text-xs" onClick={() => setInteractionMode("none")} type="button" variant="secondary">Cancel</Button>
          )}
          <Button className="h-8 px-2 text-xs" onClick={() => void sendScreenshotEvidence()} type="button" variant="secondary">
            <Send className="size-3" />
            Send evidence
          </Button>
        </div>
      ) : null}

      {statusText || state?.error ? (
        <div className="shrink-0 border-b border-line bg-surface-soft px-3 py-2 text-xs text-ink-soft">
          {state?.error ?? statusText}
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-[#eef3f6]">
        <div ref={hostRef} className="absolute inset-0" />
        {interactionMode !== "none" ? (
          <button
            className="absolute inset-0 z-10 cursor-crosshair bg-accent/5"
            onClick={(event) => void handleViewportClick(event)}
            type="button"
          >
            <span className="sr-only">Select browser point</span>
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function readStoredBrowserState(): Record<string, StoredThreadBrowserState> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, StoredThreadBrowserState>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
