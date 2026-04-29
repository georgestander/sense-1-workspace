import { Camera, ChevronLeft, ChevronRight, ExternalLink, Globe2, MessageSquarePlus, MousePointer2, RefreshCw, Search, Send, Smartphone, Tablet } from "lucide-react";

import type { DesktopBrowserState, DesktopBrowserViewportPreset } from "../../../main/contracts";
import { Button } from "../ui/button";

interface ThreadBrowserToolbarProps {
  address: string;
  blocked: boolean;
  canUseBrowser: boolean;
  interactionMode: "none" | "comment" | "click" | "type";
  state: DesktopBrowserState | null;
  threadId: string;
  viewport: DesktopBrowserViewportPreset;
  onAddressChange: (address: string) => void;
  onCaptureScreenshot: () => void;
  onInspectPage: () => void;
  onNavigate: () => void;
  onOpenExternal: () => void;
  onSendEvidence: () => void;
  onSetInteractionMode: (mode: "none" | "comment" | "click" | "type") => void;
  onStateChange: (state: DesktopBrowserState) => void;
  onUpdateViewport: (viewport: DesktopBrowserViewportPreset) => void;
}

const VIEWPORT_BUTTONS = [
  { id: "desktop" as const, label: "Desktop", icon: Globe2 },
  { id: "tablet" as const, label: "Tablet", icon: Tablet },
  { id: "mobile" as const, label: "Mobile", icon: Smartphone },
];

export function ThreadBrowserToolbar({
  address,
  blocked,
  canUseBrowser,
  interactionMode,
  state,
  threadId,
  viewport,
  onAddressChange,
  onCaptureScreenshot,
  onInspectPage,
  onNavigate,
  onOpenExternal,
  onSendEvidence,
  onSetInteractionMode,
  onStateChange,
  onUpdateViewport,
}: ThreadBrowserToolbarProps) {
  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Button aria-label="Back" className="h-8 w-8 px-0" disabled={!state?.canGoBack} onClick={async () => onStateChange(await window.sense1Desktop.browser.goBack({ threadId }))} type="button" variant="secondary">
          <ChevronLeft className="size-4" />
        </Button>
        <Button aria-label="Forward" className="h-8 w-8 px-0" disabled={!state?.canGoForward} onClick={async () => onStateChange(await window.sense1Desktop.browser.goForward({ threadId }))} type="button" variant="secondary">
          <ChevronRight className="size-4" />
        </Button>
        <Button aria-label="Reload" className="h-8 w-8 px-0" onClick={async () => onStateChange(await window.sense1Desktop.browser.reload({ threadId }))} type="button" variant="secondary">
          <RefreshCw className="size-4" />
        </Button>
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            onNavigate();
          }}
        >
          <Globe2 className="size-3.5 shrink-0 text-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            onChange={(event) => onAddressChange(event.target.value)}
            value={address}
          />
        </form>
        <Button aria-label="Open externally" className="h-8 w-8 px-0" onClick={onOpenExternal} type="button" variant="secondary">
          <ExternalLink className="size-4" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex items-center gap-1">
          {VIEWPORT_BUTTONS.map(({ id, label, icon: Icon }) => (
            <Button className="h-7 px-2 text-[0.7rem]" key={id} onClick={() => onUpdateViewport(id)} type="button" variant={viewport === id ? "default" : "secondary"}>
              <Icon className="size-3" />
              {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button className="h-7 px-2 text-[0.7rem]" onClick={onCaptureScreenshot} type="button" variant="secondary">
            <Camera className="size-3" />
            Shot
          </Button>
          <Button className="h-7 px-2 text-[0.7rem]" onClick={() => onSetInteractionMode(interactionMode === "comment" ? "none" : "comment")} type="button" variant={interactionMode === "comment" ? "default" : "secondary"}>
            <MessageSquarePlus className="size-3" />
            Comment
          </Button>
          <Button className="h-7 px-2 text-[0.7rem]" disabled={!canUseBrowser || blocked} onClick={onInspectPage} type="button" variant="secondary">
            <Search className="size-3" />
            Inspect
          </Button>
          <Button className="h-7 px-2 text-[0.7rem]" disabled={!canUseBrowser || blocked} onClick={() => onSetInteractionMode(interactionMode === "click" ? "none" : "click")} type="button" variant={interactionMode === "click" ? "default" : "secondary"}>
            <MousePointer2 className="size-3" />
            Click
          </Button>
          <Button className="h-7 px-2 text-[0.7rem]" disabled={!canUseBrowser || blocked} onClick={() => onSetInteractionMode(interactionMode === "type" ? "none" : "type")} type="button" variant={interactionMode === "type" ? "default" : "secondary"}>
            Type
          </Button>
          <Button className="h-7 px-2 text-[0.7rem]" onClick={onSendEvidence} type="button" variant="secondary">
            <Send className="size-3" />
            Send
          </Button>
        </div>
      </div>
    </>
  );
}
