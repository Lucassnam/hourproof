// No "use client": this module has no hooks, so Server Components (the home page) can call
// buttonClasses() directly, and Client Components can still render <Button>.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "strong" | "primary" | "ghost";
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
    variant === "strong"
      ? // The one main next step on a screen (e.g. Continue, Start tracking my hours). The
        // `bg` token on a `signal` fill is >= 4.5:1 in both themes (see contrast.test.ts).
        // Disabled falls back to the outlined look with muted text and a dashed edge.
        "bg-signal text-bg border-2 border-signal disabled:cursor-not-allowed disabled:border-dashed disabled:border-border disabled:bg-surface-2 disabled:text-text-muted"
      : variant === "primary"
        ? // The 2px outline in the `border` token (>= 3:1 on every background) is what makes
          // these read as buttons; the fill alone is only ~1.05:1 against the page.
          "bg-surface-2 text-text border-2 border-border"
        : "bg-transparent text-text-muted underline decoration-2 underline-offset-4";
  return [
    sizeClass,
    widthClass,
    "rounded-2xl px-6 text-lg font-semibold text-center flex items-center justify-center transition-colors",
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
