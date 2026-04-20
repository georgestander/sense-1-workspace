import React, { useEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/cn";
import { VersionBadgeLink } from "./VersionBadgeLink";
import sense1IconUrl from "../../../resources/icon-1024.png";

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

export interface ProfileNamingStepProps {
  inferredDisplayName: string | null;
  submitting: boolean;
  errorMessage: string | null;
  runtimeStatus: { appVersion: string; platform: string } | null;
  onSubmit: (displayName: string) => Promise<void>;
}

export function ProfileNamingStep({
  inferredDisplayName,
  submitting,
  errorMessage,
  runtimeStatus,
  onSubmit,
}: ProfileNamingStepProps) {
  const initialRef = useRef(inferredDisplayName ?? "");
  const [name, setName] = useState(initialRef.current);

  useEffect(() => {
    if (inferredDisplayName && !initialRef.current) {
      initialRef.current = inferredDisplayName;
      setName(inferredDisplayName);
    }
  }, [inferredDisplayName]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    await onSubmit(trimmedName);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-[1.35rem] bg-surface-soft p-1.5 shadow-[var(--shadow-raised)]">
            <BrandMark className="size-full rounded-[1rem]" />
          </div>
          <p className="mt-2 text-sm uppercase tracking-[0.12em] text-muted">sense-1 workspace</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">What should we call you?</h1>
          <p className="mt-2 text-sm leading-5 text-muted">
            Sense-1 couldn&apos;t find a reliable name from your sign-in. Confirm what you&apos;d like us to use.
          </p>
        </div>

        <form className="mt-8 flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="text-xs uppercase tracking-[0.12em] text-muted" htmlFor="profile-display-name-input">
            Display name
          </label>
          <Input
            autoComplete="name"
            autoFocus
            disabled={submitting}
            id="profile-display-name-input"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Alex Morgan"
            spellCheck={false}
            value={name}
          />
          <Button
            className="mt-2"
            disabled={!canSubmit}
            size="default"
            type="submit"
            variant="default"
          >
            {submitting ? "Saving..." : "Continue"}
          </Button>
          <p className="text-xs text-muted">You can change this later from the account menu.</p>
        </form>

        {errorMessage && (
          <p className="mt-4 rounded-xl bg-surface-soft px-3 py-2 text-center text-sm text-muted" role="alert">
            {errorMessage}
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
