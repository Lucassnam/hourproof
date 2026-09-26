"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost";
export type ButtonSize = "md" | "lg";

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}) {
  // 56px (lg) covers the Yes/No/Not sure choices; 48px (md) covers Back/Start over.
  const sizeClass = size === "lg" ? "min-h-14" : "min-h-12";
  const widthClass = fullWidth ? "w-full" : "";
  const variantClass =
    variant === "primary"
      ? "bg-surface-2 text-text"
      : "bg-transparent text-text-muted underline decoration-2 underline-offset-4";
  return [
    sizeClass,
    widthClass,
    "rounded-2xl px-6 text-lg font-semibold flex items-center justify-center transition-colors",
    variantClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({ variant, size, fullWidth, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {children}
    </button>
  );
}
