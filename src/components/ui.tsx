/**
 * The vocabulary the four screens are built from: a card, a button, a field, a
 * banner, the two kinds of chip, a segmented control and the fit gauge.
 *
 * No "use client" directive on purpose. None of these hold state or call a
 * hook, so they compile into whichever graph imports them — the landing page
 * renders `Button` on the server, the filter panel renders `Chip` on the
 * client, and neither needs a variant of its own.
 */

import type { ReactNode } from "react";

/** Tailwind can't see a class it has to concatenate at runtime, so every
 * variant is written out whole. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * A raised surface on the page ground. Bordered rather than shadowed: the
 * system separates things by a one-pixel hairline and a shift in surface, and
 * a drop shadow on every card is how a dark interface turns to mush.
 */
export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-[14px] border border-line bg-surf p-[18px]", className)}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "outline" | "pill" | "danger" | "ghost";

const BUTTON_BASE =
  // min-h-11 everywhere: a 44px target is the floor for a finger, and these are
  // the same controls on a phone as on a desktop.
  "inline-flex min-h-11 items-center justify-center gap-2 px-4 text-[15px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-[10px] bg-acc text-acc-tx hover:opacity-[0.88]",
  // The only round thing in the system, kept for the landing's single call to
  // action so it reads as the one door in.
  pill: "rounded-full bg-acc px-[22px] text-acc-tx hover:opacity-[0.88]",
  outline:
    "rounded-[9px] border border-line2 bg-surf px-[16px] text-[13.5px] font-medium hover:bg-surf2",
  danger: "rounded-[10px] bg-warn text-acc-tx hover:opacity-[0.88]",
  ghost: "rounded-[9px] text-[13.5px] font-medium text-tx2 hover:bg-surf2 hover:text-tx",
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

/**
 * Fields sit *below* the surface they are on — page ground inside a card — so
 * an input reads as a slot rather than as another card. The accent border on
 * focus is the same signal the chips use for "this one is active".
 */
const CONTROL =
  "w-full rounded-[10px] border border-line bg-bg px-[13px] text-[14.5px] text-tx transition-colors placeholder:text-tx3 focus:border-acc-line";

export function inputClass(className?: string) {
  return cx(CONTROL, "h-11", className);
}

export function selectClass(className?: string) {
  return cx(CONTROL, "h-11", className);
}

export function textareaClass(className?: string) {
  return cx(CONTROL, "resize-y py-[11px] leading-relaxed", className);
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
      <label htmlFor={id} className="block text-[13.5px] font-semibold">
        {label}
        {optional && <span className="ml-1.5 font-normal text-tx3">opcional</span>}
      </label>
      {children}
      {hint && (
        <p
          id={`${id}-hint`}
          className={cx(
            "text-[12.5px] leading-relaxed",
            hintTone === "danger" ? "text-warn" : "text-tx3"
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

type BannerTone = "danger" | "warning" | "success";

const BANNER_TONES: Record<BannerTone, string> = {
  danger: "border-warn/45 text-warn",
  warning: "border-warn/30 text-warn",
  success: "border-ok/45 text-ok",
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
        "rounded-[10px] border bg-surf px-[13px] py-2.5 text-sm",
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
export function Chip({
  label,
  checked,
  onChange,
  title,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <label
      title={title ?? label}
      className={cx(
        "inline-flex cursor-pointer select-none items-center gap-1.5 rounded-lg border px-2.5 py-[5px] text-[13px] transition active:scale-95",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-acc",
        checked
          ? "border-acc-line bg-acc-soft font-medium text-acc"
          : "border-line text-tx2 hover:border-line2 hover:text-tx",
        className
      )}
    >
      {/* sr-only, not hidden: `display:none` removes it from the tab order and
          from the accessibility tree, which is the whole point of keeping it. */}
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      {/* Selection is not signalled by colour alone. The tick — and the width
          it adds — reads as a shape change for anyone who can't separate the
          tinted chip from the outlined one by hue. */}
      {checked && (
        <span aria-hidden="true" className="text-[10px] leading-none">
          ✓
        </span>
      )}
      <span className="max-w-40 truncate">{label}</span>
    </label>
  );
}

/**
 * One-of-N, as a filled tab inside a tray. Used for sort order, the list/grid
 * switch and the register/login modes — three places that were each inventing
 * their own control before.
 *
 * `radio` rather than `tab`: nothing here reveals a panel, so the tab pattern
 * would promise a relationship the markup does not have.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex gap-0.5 rounded-[10px] border border-line bg-surf p-[3px]",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cx(
              "min-h-9 rounded-[7px] px-[13px] text-[13px] transition",
              active
                ? "bg-acc font-semibold text-acc-tx"
                : "text-tx2 hover:bg-surf2 hover:text-tx"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Non-interactive metadata — a technology named in a listing. Set in the mono
 * because it is a token lifted off the description, not prose. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="valor inline-flex items-center rounded-[7px] border border-line bg-surf2 px-[9px] py-1 text-xs text-tx2">
      {children}
    </span>
  );
}

/** Shown while a list is loading, so the page keeps its shape instead of
 * collapsing to a single line of text and jumping back. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-surf2", className)} />;
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
        active ? "bg-line opacity-100" : "opacity-0"
      )}
    >
      {active && <div className="motion-sweep h-full w-1/4 bg-acc" />}
    </div>
  );
}

/**
 * The fit gauge — the one element this interface is meant to be remembered by.
 *
 * One bar per skill you searched for, in the order you searched them:
 *
 *   full   the skill is in the job title
 *   half   it is only in the description
 *   empty  it does not appear
 *
 * That is not an illustration of the score, it *is* the score taken apart. The
 * ranking weights a title hit at three times a description hit
 * (src/lib/matching.ts), so a row of full bars and a row of half ones are
 * genuinely different listings even when the count matches — and no other job
 * board can show this, because none of them rank this way.
 *
 * Height, not hue, is what separates half from empty: the three states stay
 * apart for anyone who cannot tell the accent from the track by colour.
 */
type GaugeState = "title" | "body" | "none";

const STATE_TITLES: Record<GaugeState, string> = {
  title: "en el título",
  body: "en la descripción",
  none: "no aparece",
};

function gaugeStates(
  skills: string[],
  matched: string[],
  inTitle: string[]
): { skill: string; state: GaugeState }[] {
  const matchedSet = new Set(matched.map((s) => s.toLowerCase()));
  const titleSet = new Set(inTitle.map((s) => s.toLowerCase()));

  return skills.map((skill) => {
    const key = skill.toLowerCase();
    return {
      skill,
      state: titleSet.has(key) ? "title" : matchedSet.has(key) ? "body" : "none",
    };
  });
}

/** The track, and the fill it is or isn't carrying. Shared by the gauge and
 * its legend so a change to the notation can only happen in one place. */
function Bar({
  state,
  className,
  title,
}: {
  state: GaugeState;
  className: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx("flex items-end overflow-hidden rounded-[2px] bg-line2", className)}
    >
      {state !== "none" && (
        <span
          className={cx(
            "w-full bg-acc",
            state === "title" ? "h-full" : "h-1/2 opacity-55"
          )}
        />
      )}
    </span>
  );
}

export function FitBars({
  skills,
  matched,
  inTitle,
  size = "sm",
}: {
  /** Every skill the search ran with, in order. */
  skills: string[];
  matched: string[];
  inTitle: string[];
  size?: "sm" | "lg";
}) {
  const bars = gaugeStates(skills, matched, inTitle);
  const hits = bars.filter((b) => b.state !== "none").length;

  return (
    <div
      // One label for the whole gauge. Announcing eight bars separately would
      // read as eight meaningless list items.
      role="img"
      aria-label={`${hits} de ${skills.length} skills`}
      className="flex gap-[3px]"
    >
      {bars.map(({ skill, state }) => (
        <Bar
          key={skill}
          state={state}
          // The tooltip is the only way to read which skill a bar is, and it
          // costs nothing to attach.
          title={`${skill} — ${STATE_TITLES[state]}`}
          className={size === "lg" ? "h-[26px] w-2" : "h-5 w-[7px]"}
        />
      ))}
    </div>
  );
}

/** Bars plus the fraction they add up to. `row` sits the count beside them for
 * a list line; `stack` puts it above for a card's right rail. */
export function FitGauge({
  skills,
  matched,
  inTitle,
  layout = "row",
  className,
}: {
  skills: string[];
  matched: string[];
  inTitle: string[];
  layout?: "row" | "stack";
  className?: string;
}) {
  const hits = gaugeStates(skills, matched, inTitle).filter(
    (b) => b.state !== "none"
  ).length;

  if (layout === "stack") {
    return (
      <div className={cx("flex flex-col items-end gap-[9px]", className)}>
        {/* aria-hidden on every fraction: FitBars already announces the same
            count, and two readings of "3 de 5" in a row is noise. */}
        <span
          aria-hidden="true"
          className="valor text-[26px] font-medium leading-none text-acc"
        >
          {hits}/{skills.length}
        </span>
        <FitBars skills={skills} matched={matched} inTitle={inTitle} />
      </div>
    );
  }

  return (
    <div className={cx("flex items-center gap-3", className)}>
      <FitBars skills={skills} matched={matched} inTitle={inTitle} size="lg" />
      <span aria-hidden="true" className="valor min-w-[34px] text-right text-[15px]">
        {hits}/{skills.length}
      </span>
    </div>
  );
}

/**
 * Printed wherever the gauge is, the way an instrument carries its own scale
 * rather than leaving the reader to infer it.
 */
export function GaugeLegend({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-x-[22px] gap-y-2.5", className)}>
      {(["title", "body", "none"] as const).map((state) => (
        <span key={state} className="flex items-center gap-2 text-[13.5px] text-tx2">
          <Bar state={state} className="h-4 w-2" />
          {STATE_TITLES[state]}
        </span>
      ))}
    </div>
  );
}
