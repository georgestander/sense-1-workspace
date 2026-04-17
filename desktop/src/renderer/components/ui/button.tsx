import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-accent/30 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas hover:opacity-90",
        secondary: "border border-line bg-surface-high text-ink hover:bg-surface-soft",
        destructive: "bg-danger text-on-danger hover:opacity-90",
        ghost: "text-muted hover:bg-surface-soft hover:text-ink",
        subtle: "bg-surface-soft text-ink hover:bg-surface",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />;
}
