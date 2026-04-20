export interface DesktopIdentityState {
  readonly displayName: string | null;
  readonly inferredDisplayName: string | null;
  readonly needsDisplayName: boolean;
}

export interface DesktopCompleteDisplayNameRequest {
  readonly displayName: string;
}

export interface DesktopCompleteDisplayNameResult {
  readonly success: boolean;
  readonly reason?: string;
}
