export type DesktopBrowserViewportPreset = "desktop" | "tablet" | "mobile";

export type DesktopBrowserTrustDecision = "allowOnce" | "alwaysAllow" | "block";

export interface DesktopBrowserBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DesktopBrowserState {
  readonly threadId: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly loading: boolean;
  readonly viewport: DesktopBrowserViewportPreset;
  readonly error: string | null;
}

export interface DesktopBrowserOpenRequest {
  readonly threadId: string;
  readonly bounds: DesktopBrowserBounds;
  readonly url?: string | null;
  readonly viewport?: DesktopBrowserViewportPreset;
}

export interface DesktopBrowserBoundsRequest {
  readonly threadId: string;
  readonly bounds: DesktopBrowserBounds;
}

export interface DesktopBrowserNavigateRequest {
  readonly threadId: string;
  readonly url: string;
}

export interface DesktopBrowserThreadRequest {
  readonly threadId: string;
}

export interface DesktopBrowserViewportRequest {
  readonly threadId: string;
  readonly viewport: DesktopBrowserViewportPreset;
  readonly bounds: DesktopBrowserBounds;
}

export interface DesktopBrowserScreenshotRequest {
  readonly threadId: string;
}

export interface DesktopBrowserScreenshotResult {
  readonly threadId: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly capturedAt: string;
  readonly dataUrl: string;
}

export interface DesktopBrowserInspectRequest {
  readonly threadId: string;
  readonly selector?: string | null;
}

export interface DesktopBrowserInspectResult {
  readonly url: string | null;
  readonly title: string | null;
  readonly text: string;
  readonly selector: string | null;
}

export interface DesktopBrowserPointRequest {
  readonly threadId: string;
  readonly x: number;
  readonly y: number;
}

export interface DesktopBrowserTypeRequest extends DesktopBrowserPointRequest {
  readonly text: string;
}

export interface DesktopBrowserConsoleEntry {
  readonly level: string;
  readonly message: string;
  readonly occurredAt: string;
}

export interface DesktopBrowserConsoleResult {
  readonly entries: DesktopBrowserConsoleEntry[];
}

export interface DesktopBrowserNetworkEntry {
  readonly url: string;
  readonly method: string;
  readonly status: number | null;
  readonly failed: boolean;
}

export interface DesktopBrowserNetworkResult {
  readonly entries: DesktopBrowserNetworkEntry[];
}

export interface DesktopBrowserTrustRequest {
  readonly origin: string;
  readonly decision: DesktopBrowserTrustDecision;
}

export interface DesktopBrowserTrustState {
  readonly allowedOrigins: string[];
  readonly blockedOrigins: string[];
}

export interface DesktopBrowserTrustCheckRequest {
  readonly url: string;
}

export interface DesktopBrowserTrustCheckResult {
  readonly origin: string | null;
  readonly status: "allowed" | "blocked" | "needsApproval" | "invalid";
  readonly message: string | null;
}
