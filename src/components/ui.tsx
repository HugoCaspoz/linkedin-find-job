/**
 * The vocabulary of the sheet: a field (label cell + value), a rule, a button,
 * a banner, the two kinds of chip, and the fit gauge.
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

/**
 * A block on the sheet. Bordered rather than raised: paper has no elevation,
 * and a drop shadow here would be the one detail that gives the metaphor away.
 */
export function Sheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-sm border border-pauta-fuerte p-6", className)}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "outline" | "danger" | "ghost";

const BUTTON_BASE =
  // min-h-11 everywhere: a 44px target is the floor for a finger, and these are
  // the same controls on a phone as on a desktop.
  //
  // Chrome is ink, never the spot colour. A filled ink button on paper is the
  // strongest thing a two-ink sheet can print, and it leaves `--medida` free to
  // mean "measured".
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-marca text-papel hover:opacity-90",
  outline: "border border-pauta-fuerte hover:bg-pauta",
  danger: "bg-aviso text-papel hover:opacity-90",
  ghost: "text-tinta-2 hover:bg-pauta hover:text-tinta",
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

/** Inputs are set in the mono: everything you type here ends up as a value on
 * the sheet, so it is written in the face values are written in. */
const CONTROL =
  "w-full min-h-11 rounded-sm border border-pauta-fuerte bg-transparent px-3 font-mono text-sm placeholder:text-tinta-2";

export function inputClass(className?: string) {
  return cx(CONTROL, "py-2", className);
}

export function selectClass(className?: string) {
  return cx(CONTROL, "py-2", className);
}

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
      <label htmlFor={id} className="rotulo block">
        {label}
        {optional && <span className="ml-1.5 normal-case tracking-normal">opcional</span>}
      </label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className={cx("text-sm", hintTone === "danger" ? "text-aviso" : "text-tinta-2")}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

type BannerTone = "danger" | "warning" | "success";

const BANNER_TONES: Record<BannerTone, string> = {
  danger: "border-aviso/50 bg-aviso-suave text-aviso",
  warning: "border-aviso/35 bg-aviso-suave text-aviso",
  success: "border-ok/50 text-ok",
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
      className={cx("rounded-sm border px-3 py-2.5 text-sm", BANNER_TONES[tone], className)}
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
        "inline-flex min-h-9 cursor-pointer select-none items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-sm transition active:scale-95",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marca",
        checked
          ? "border-marca bg-marca text-papel"
          : "border-pauta-fuerte text-tinta-2 hover:bg-pauta hover:text-tinta"
      )}
    >
      {/* sr-only, not hidden: `display:none` removes it from the tab order and
          from the accessibility tree, which is the whole point of keeping it. */}
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      {/* Selection is not signalled by colour alone. The tick — and the width
          it adds — reads as a shape change for anyone who can't separate the
          filled chip from the outlined one by hue. */}
      {checked && (
        <span aria-hidden="true" className="text-xs leading-none">
          ✓
        </span>
      )}
      <span className="max-w-40 truncate">{label}</span>
    </label>
  );
}

/** Non-interactive metadata, set as a value because that is what it is. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="valor inline-flex items-center rounded-sm bg-pauta px-2 py-0.5 text-xs text-tinta-2">
      {children}
    </span>
  );
}

/** Shown while a list is loading, so the page keeps its shape instead of
 * collapsing to a single line of text and jumping back. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-sm bg-pauta", className)} />;
}

/**
 * Indeterminate progress. Used while a search runs: the duration depends on
 * Postgres and, when it is in play, a third-party API, so there is no
 * percentage to report.
 *
 * Not a live region — the caller already announces the result through one, and
 * a bar that announced itself would interrupt on every filter change.
 */
export function ProgressBar({ active }: { active: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Buscando ofertas"
      aria-hidden={!active}
      className={cx(
        "h-px overflow-hidden transition-opacity duration-200",
        active ? "bg-pauta opacity-100" : "opacity-0"
      )}
    >
      {active && <div className="motion-sweep h-full w-1/4 bg-medida" />}
    </div>
  );
}

/**
 * The fit gauge — the one element this interface is meant to be remembered by.
 *
 * One segment per skill you searched for, in the order you searched them:
 *
 *   filled  the skill is in the job title
 *   half    it is only in the description
 *   empty   it does not appear
 *
 * That is not an illustration of the score, it *is* the score taken apart. The
 * ranking weights a title hit at three times a description hit
 * (src/lib/matching.ts), so a row of solid segments and a row of half ones are
 * genuinely different listings even when the count matches — and no other job
 * board can show this, because none of them rank this way.
 */
export function FitGauge({
  skills,
  matched,
  inTitle,
  className,
}: {
  /** Every skill the search ran with, in order. */
  skills: string[];
  matched: string[];
  inTitle: string[];
  className?: string;
}) {
  const matchedSet = new Set(matched.map((s) => s.toLowerCase()));
  const titleSet = new Set(inTitle.map((s) => s.toLowerCase()));

  const summary = `${matchedSet.size} de ${skills.length} skills`;

  return (
    <div className={cx("inline-flex flex-col gap-1", className)}>
      {/* One label for the whole gauge. Announcing eight segments separately
          would read as eight meaningless list items. */}
      <div role="img" aria-label={summary} className="flex gap-px">
        {skills.map((skill) => {
          const key = skill.toLowerCase();
          const state = titleSet.has(key)
            ? "title"
            : matchedSet.has(key)
              ? "body"
              : "none";

          return (
            <span
              key={skill}
              // The tooltip is the only way to read which skill a segment is,
              // and it costs nothing to attach.
              title={
                state === "title"
                  ? `${skill} — en el título`
                  : state === "body"
                    ? `${skill} — en la descripción`
                    : `${skill} — no aparece`
              }
              className={cx(
                "h-4 w-2",
                state === "title" && "bg-medida",
                // Half fill drawn as a gradient stop rather than an opacity,
                // so it stays distinguishable from the empty state for anyone
                // who cannot separate the two by tone.
                state === "body" &&
                  "bg-[linear-gradient(to_top,var(--medida)_50%,var(--pauta)_50%)]",
                state === "none" && "bg-pauta"
              )}
            />
          );
        })}
      </div>
      <span className="valor text-xs text-tinta-2">
        {matchedSet.size}/{skills.length}
      </span>
    </div>
  );
}
