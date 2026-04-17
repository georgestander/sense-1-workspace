import type * as React from "react";
import { forwardRef } from "react";

import { cn } from "../../lib/cn";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        className={cn(
          "h-10 w-full min-w-0 rounded-xl border border-line bg-surface-high px-3 text-sm text-ink outline-none transition-all placeholder:text-muted focus-visible:ring-[3px] focus-visible:ring-accent/30 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
