/**
 * The handful of shapes the app actually repeats: a card, a filled or outlined
 * button, a labelled field, a status banner, and the two kinds of chip.
 *
 * No "use client" directive on purpose. None of these hold state or call a
 * hook, so they compile into whichever graph imports them — the landing page
 * renders `Button` on the server, the filter panel renders `Toggle` on the
 * client, and neither needs a variant of its own.
 */

import type { ReactNode } from "react";

/** Tailwind can't see a class it has to concatenate at runtime, so every
 * variant is written out whole. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-surface p-6 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "outline" | "danger" | "ghost";

const BUTTON_BASE =
  // min-h-11 everywhere: a 44px target is the floor for a finger, and these
  // are the same controls on a phone as on a desktop.
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:opacity-90",
  outline: "border border-line-strong hover:bg-chip",
  danger: "bg-danger text-danger-contrast hover:opacity-90",
  ghost: "text-muted hover:text-foreground hover:bg-chip",
};

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

const CONTROL =
  "w-full min-h-11 rounded-lg border border-line-strong bg-transparent px-3 text-sm placeholder:text-muted";

/**
 * Label, control and hint as one unit. Every field in the app was assembling
 * this by hand, which is how the file input ended up with no label at all.
 */
export function Field({
  id,
  label,
  hint,
  hintTone = "muted",
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  hintTone?: "muted" | "danger";
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(opcional)</span>}
      </label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className={cx(
            "text-sm",
            hintTone === "danger" ? "text-danger" : "text-muted"
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function inputClass(className?: string) {
  return cx(CONTROL, "py-2", className);
}

export function selectClass(className?: string) {
  return cx(CONTROL, "py-2", className);
}

type BannerTone = "danger" | "warning" | "success";

const BANNER_TONES: Record<BannerTone, string> = {
  danger: "border-danger/40 bg-danger-soft text-danger",
  warning: "border-warning/40 bg-warning-soft text-warning",
  success: "border-success/40 bg-transparent text-success",
};

export function Banner({
  tone,
  children,
  className,
}: {
  tone: BannerTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      // Only failures interrupt. A success or an informational notice is
      // announced by the polite region its caller already wraps it in.
      role={tone === "danger" ? "alert" : undefined}
      className={cx(
        "rounded-lg border px-3 py-2.5 text-sm",
        BANNER_TONES[tone],
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * A checkbox that looks like a chip. The input stays in the DOM rather than
 * being replaced by a div with an onClick: that is what keeps it reachable by
 * keyboard, announced as a checkbox, and togglable with space.
 */
export function Toggle({
  label,
  checked,
  onChange,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
}) {
  return (
    <label
      title={title ?? label}
      className={cx(
        "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm transition",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        checked
          ? "border-accent bg-accent text-accent-contrast"
          : "border-line-strong hover:bg-chip"
      )}
    >
      {/* sr-only, not hidden: `display:none` removes it from the tab order and
          from the accessibility tree, which is the whole point of keeping it. */}
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="max-w-40 truncate">{label}</span>
    </label>
  );
}

/** Non-interactive metadata: modality, source, age, matched skills. */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs",
        tone === "accent" ? "bg-accent-soft text-accent" : "bg-chip text-muted"
      )}
    >
      {children}
    </span>
  );
}

/** Shown while a list is loading, so the page keeps its shape instead of
 * collapsing to a single line of text and jumping back. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-chip", className)} />;
}
