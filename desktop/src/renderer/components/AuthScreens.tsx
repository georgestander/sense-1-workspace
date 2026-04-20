import React, { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/cn";
import { VersionBadgeLink } from "./VersionBadgeLink";
import sense1IconUrl from "../../../resources/icon-1024.png";
import type { DesktopAuthLoginMethod } from "../../shared/contracts/bootstrap";
import type { DesktopProviderState, DesktopProviderId } from "../../shared/contracts/management";
import { type RuntimeSetupState, runtimeSetupGuidance } from "../use-desktop-session-state.js";

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("select-none object-contain", className)}
      draggable={false}
      src={sense1IconUrl}
    />
  );
}

/* ── Provider logos (official marks, monochrome-safe) ── */

function ChatGPTLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071.005l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071-.005l4.83 2.786a4.494 4.494 0 0 1-.676 8.1v-5.678a.79.79 0 0 0-.407-.652zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function OpenAiKeyLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.5 2a6.5 6.5 0 0 0-6.266 8.26L2.75 16.743a2.56 2.56 0 0 0-.75 1.811v2.196c0 .69.56 1.25 1.25 1.25h3.25a1.25 1.25 0 0 0 1.25-1.25v-1.5h1.5a1.25 1.25 0 0 0 1.25-1.25v-1.5h1.5c.332 0 .65-.132.884-.366l1.356-1.356A6.5 6.5 0 1 0 15.5 2zm1.75 6a1.75 1.75 0 1 1 0-3.5 1.75 1.75 0 0 1 0 3.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function GeminiLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z"
        fill="currentColor"
      />
    </svg>
  );
}

function OllamaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C8.134 2 5 5.134 5 9c0 1.387.403 2.677 1.098 3.764C5.4 13.856 5 15.12 5 16.5 5 19.538 7.462 22 10.5 22h3c3.038 0 5.5-2.462 5.5-5.5 0-1.38-.4-2.644-1.098-3.736A6.965 6.965 0 0 0 19 9c0-3.866-3.134-7-7-7zm-2.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6.5-1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM10 17.5c0-.276.344-.5.768-.5h2.464c.424 0 .768.224.768.5s-.344.5-.768.5h-2.464c-.424 0-.768-.224-.768-.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function ProviderLogo({ providerId, className }: { providerId: DesktopProviderId; className?: string }) {
  switch (providerId) {
    case "chatgpt":
      return <ChatGPTLogo className={className} />;
    case "openai-api-key":
      return <OpenAiKeyLogo className={className} />;
    case "gemini":
      return <GeminiLogo className={className} />;
    case "ollama":
      return <OllamaLogo className={className} />;
    default:
      return null;
  }
}

export interface AuthScreensProps {
  bootstrapLoading: boolean;
  runtimeSetup: RuntimeSetupState;
  isSignedIn: boolean;
  accountEmail: string;
  handleStartAuthLogin: (request: { method: DesktopAuthLoginMethod; apiKey?: string }) => Promise<void>;
  authPendingMethod: DesktopAuthLoginMethod | null;
  signInPending: boolean;
  bootstrapError: string | null;
  runtimeStatus: { appVersion: string; platform: string } | null;
  providerState: DesktopProviderState | null;
  refreshBootstrap: (opts: { restoreSelection: boolean }) => void;
}

export function AuthScreens(props: AuthScreensProps) {
  const {
    bootstrapLoading,
    runtimeSetup,
    isSignedIn,
    handleStartAuthLogin,
    authPendingMethod,
    signInPending,
    bootstrapError,
    runtimeStatus,
    providerState,
    refreshBootstrap,
  } = props;

  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  if (bootstrapLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-md rounded-3xl bg-surface-high p-8 text-center shadow-[var(--shadow-overlay)]">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[1.35rem] bg-surface-soft p-1.5 shadow-[var(--shadow-raised)]">
            <BrandMark className="size-full rounded-[1rem]" />
          </div>
          <p className="text-sm uppercase tracking-[0.12em] text-muted">sense-1 workspace</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Loading your desktop profile</h1>
          <p className="mt-2 text-sm text-muted">Connecting to local runtime and fetching recent work.</p>
        </div>
      </div>
    );
  }

  if (runtimeSetup?.blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-10 text-ink">
        <div className="w-full max-w-xl rounded-3xl bg-surface-high p-8 shadow-[var(--shadow-overlay)]">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[1.35rem] bg-surface-soft p-1.5 shadow-[var(--shadow-raised)]">
            <BrandMark className="size-full rounded-[1rem]" />
          </div>
          <p className="text-sm uppercase tracking-[0.12em] text-muted">sense-1</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{runtimeSetup.title}</h1>
          <p className="mt-3 text-sm leading-6 text-muted">{runtimeSetup.message}</p>
          <div className="mt-5 rounded-2xl bg-surface-soft px-4 py-3 text-sm text-ink-soft">
            {runtimeSetupGuidance(runtimeSetup)}
          </div>
          {runtimeSetup.detail ? (
            <pre className="mt-4 overflow-auto rounded-2xl bg-canvas px-4 py-3 text-xs text-muted whitespace-pre-wrap">
              {runtimeSetup.detail}
            </pre>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => void refreshBootstrap({ restoreSelection: true })} variant="default">
              Retry runtime check
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    const providerOptions = providerState?.options ?? [];
    const trimmedApiKey = apiKeyInput.trim();
    const isChatgptPending = signInPending && authPendingMethod === "chatgpt";
    const isApiKeyPending = signInPending && authPendingMethod === "apiKey";
    const canSubmitApiKey = trimmedApiKey.length > 0 && !signInPending;

    function onTileClick(providerId: DesktopProviderId) {
      if (providerId === "chatgpt") {
        void handleStartAuthLogin({ method: "chatgpt" });
        return;
      }
      if (providerId === "openai-api-key") {
        setApiKeyOpen((open) => !open);
      }
    }

    async function onSubmitApiKey(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!canSubmitApiKey) {
        return;
      }
      await handleStartAuthLogin({ method: "apiKey", apiKey: trimmedApiKey });
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-ink">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-[1.35rem] bg-surface-soft p-1.5 shadow-[var(--shadow-raised)]">
              <BrandMark className="size-full rounded-[1rem]" />
            </div>
            <p className="mt-2 text-sm uppercase tracking-[0.12em] text-muted">sense-1 workspace</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in to continue</h1>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            {providerOptions.length > 0 ? providerOptions.map((provider) => {
              const isChatgpt = provider.id === "chatgpt";
              const isApiKey = provider.id === "openai-api-key";
              const isApiKeyExpanded = isApiKey && apiKeyOpen;
              const tileDisabled = !provider.available || signInPending;
              const tileLabel = isChatgpt && isChatgptPending
                ? "Opening sign-in..."
                : `Sign in with ${provider.label}`;

              return (
                <div className="flex flex-col gap-3" key={provider.id}>
                  <button
                    aria-expanded={isApiKey ? apiKeyOpen : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors duration-150",
                      provider.available
                        ? "bg-surface-high hover:bg-surface-soft cursor-pointer"
                        : "bg-surface cursor-not-allowed opacity-50",
                      isApiKeyExpanded && "bg-surface-soft",
                    )}
                    disabled={tileDisabled}
                    onClick={() => onTileClick(provider.id)}
                    type="button"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-canvas">
                      <ProviderLogo providerId={provider.id} className="size-5 text-ink" />
                    </div>
                    <span className="text-sm font-medium text-ink">{tileLabel}</span>
                    {!provider.available && (
                      <span className="ml-auto text-xs text-muted">Coming soon</span>
                    )}
                  </button>

                  {isApiKeyExpanded && (
                    <form
                      className="flex flex-col gap-2 rounded-xl bg-surface-soft px-3 py-3"
                      onSubmit={onSubmitApiKey}
                    >
                      <label className="text-xs uppercase tracking-[0.12em] text-muted" htmlFor="openai-api-key-input">
                        OpenAI API key
                      </label>
                      <Input
                        autoComplete="off"
                        autoFocus
                        disabled={signInPending}
                        id="openai-api-key-input"
                        onChange={(event) => setApiKeyInput(event.target.value)}
                        placeholder="sk-..."
                        spellCheck={false}
                        type="password"
                        value={apiKeyInput}
                      />
                      <p className="text-xs text-muted">Stays on this machine. You can replace it later from the account menu.</p>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <Button
                          disabled={signInPending}
                          onClick={() => {
                            setApiKeyOpen(false);
                            setApiKeyInput("");
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                        <Button disabled={!canSubmitApiKey} size="sm" type="submit" variant="default">
                          {isApiKeyPending ? "Signing in..." : "Continue"}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              );
            }) : (
              <div className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-muted">
                Loading providers...
              </div>
            )}
          </div>

          {bootstrapError && (
            <p className="mt-4 rounded-xl bg-surface-soft px-3 py-2 text-center text-sm text-muted" role="alert">
              {bootstrapError}
            </p>
          )}
        </div>

        <div className="mt-8">
          <VersionBadgeLink
            fallbackLabel="Desktop runtime connected"
            runtimeStatus={runtimeStatus}
          />
        </div>
      </div>
    );
  }

  return null;
}
