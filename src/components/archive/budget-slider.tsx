/**
 * Archived: interactive budget amount slider with tiered ceilings.
 * Removed from the Budgets UI in favor of typed amounts; restore by importing
 * `BudgetSlider` into `src/app/(app)/budgets/page.tsx`.
 */

"use client";

import { useEffect, useState } from "react";
import { cn, formatCompactCurrency, formatCurrency } from "@/lib/format";

/** Fixed slider ceilings — expand one step at a time when releasing at the right edge. */
const SLIDER_TIERS = [500, 1000, 3000, 5000] as const;

function sliderStep(max: number): number {
  if (max <= 500) return 5;
  if (max <= 1000) return 10;
  return 25;
}

/** Smallest tier that can hold `value` (capped at the top tier). */
function tierForValue(value: number): number {
  for (const tier of SLIDER_TIERS) {
    if (value <= tier) return tier;
  }
  return SLIDER_TIERS[SLIDER_TIERS.length - 1];
}

function tierIndex(max: number): number {
  const idx = SLIDER_TIERS.indexOf(max as (typeof SLIDER_TIERS)[number]);
  return idx >= 0 ? idx : SLIDER_TIERS.indexOf(tierForValue(max) as (typeof SLIDER_TIERS)[number]);
}

/** Next higher ceiling, or the same if already at the top. */
function expandOneTier(max: number): number {
  const idx = tierIndex(max);
  if (idx < 0 || idx >= SLIDER_TIERS.length - 1) return SLIDER_TIERS[SLIDER_TIERS.length - 1];
  return SLIDER_TIERS[idx + 1];
}

/**
 * Shrink when value drops under the next-lower tier's ceiling
 * (e.g. max 3000 → under 1000 → max 1000). Never expands.
 */
function contractSliderMax(value: number, prevMax: number): number {
  const clamped = Math.max(0, value);
  const needed = tierForValue(clamped);
  let idx = tierIndex(prevMax);
  if (idx < 0) return needed;

  while (idx > 0 && clamped < SLIDER_TIERS[idx - 1]) {
    idx -= 1;
  }

  return Math.max(SLIDER_TIERS[idx], needed);
}

export function BudgetSlider({
  value,
  average,
  spent,
  onChange,
  onCommit,
  disabled,
}: {
  value: number;
  average: number;
  spent: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const [max, setMax] = useState(() => tierForValue(value));
  const step = sliderStep(max);
  const atCeiling = value >= max;
  const canExpand = tierIndex(max) < SLIDER_TIERS.length - 1;
  const displayValue = Math.min(value, max);
  const valuePct = max > 0 ? Math.min(100, (displayValue / max) * 100) : 0;
  const avgPct = max > 0 ? Math.min(100, (average / max) * 100) : 0;
  const spentPct = max > 0 ? Math.min(100, (spent / max) * 100) : 0;
  const showAvgTick = average > 0 && average <= max;
  const showSpentTick = spent > 0 && spent <= max;

  // Typed amounts: fit the ceiling to the value. Never expand mid-drag via this path.
  useEffect(() => {
    setMax((prev) => Math.max(contractSliderMax(value, prev), tierForValue(value)));
  }, [value]);

  function handleChange(next: number) {
    // Stay within the current tier while dragging so the pointer can't cascade
    // through every ceiling in one stroke.
    const clamped = Math.min(next, max);
    onChange(clamped);
    setMax((prev) => contractSliderMax(clamped, prev));
  }

  function handleCommit(el: HTMLInputElement) {
    const next = Math.min(Number(el.value), max);
    onCommit(next);
    // Expand one tier only on release at the right edge — not while dragging.
    if (next >= max && canExpand) {
      setMax(expandOneTier(max));
      return;
    }
    setMax(contractSliderMax(next, max));
  }

  return (
    <div className="w-full">
      <div className="relative h-3">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--border)]/45" />
        <div
          className="pointer-events-none absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-[var(--accent)]/40"
          style={{ width: `${valuePct}%` }}
        />
        {showAvgTick ? (
          <div
            className="pointer-events-none absolute top-1/2 z-[1] h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--muted)]"
            style={{ left: `${avgPct}%` }}
            title={`Average ${formatCurrency(average)}`}
          />
        ) : null}
        {showSpentTick ? (
          <div
            className="pointer-events-none absolute top-1/2 z-[1] h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--danger)]"
            style={{ left: `${spentPct}%` }}
            title={`Spent ${formatCurrency(spent)}`}
          />
        ) : null}
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={displayValue}
          disabled={disabled}
          aria-label="Budget amount"
          className={cn(
            "absolute inset-0 z-[2] h-3 w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-transparent",
            "[&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:top-[-3px]",
            "[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)]",
            "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-transparent",
            "[&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full",
            "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--accent)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          onChange={(e) => handleChange(Number(e.target.value))}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => handleCommit(e.currentTarget)}
          onPointerCancel={(e) => handleCommit(e.currentTarget)}
          onKeyUp={(e) => {
            if (
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "Home" ||
              e.key === "End"
            ) {
              handleCommit(e.currentTarget);
            }
          }}
        />
      </div>
      {atCeiling && canExpand ? (
        <p className="mt-1 text-right text-[11px] text-[var(--muted)]">
          Release to unlock {formatCompactCurrency(expandOneTier(max))}
        </p>
      ) : null}
    </div>
  );
}
