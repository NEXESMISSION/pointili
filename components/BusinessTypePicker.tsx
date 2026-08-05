"use client";

import { useState } from "react";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

/**
 * A grid of business categories. Renders a hidden input so it submits with the
 * surrounding form; the owner picks once and the diner sees the emoji on the
 * card. Kept controlled so the choice survives a failed submit.
 */
export function BusinessTypePicker({
  name = "businessType",
  defaultValue = "cafe",
  /** Start collapsed once a type is already chosen — 26 tiles is a lot of page
   *  for a field an owner sets once. */
  collapsible = false,
  suggested,
}: {
  name?: string;
  defaultValue?: string;
  collapsible?: boolean;
  /**
   * A guess from elsewhere on the form — on the create screen, read out of the
   * shop's own NAME. It moves the selection only while the owner has not
   * touched this control; the moment they pick anything, their choice wins for
   * good. Without that guard, typing a name after choosing a type would quietly
   * undo the choice.
   */
  suggested?: string | null;
}) {
  const [sel, setSel] = useState(defaultValue || "cafe");
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(!collapsible);

  const effective = !touched && suggested ? suggested : sel;
  const current = BUSINESS_TYPES.find((t) => t.key === effective);
  const choose = (key: string) => {
    setTouched(true);
    setSel(key);
  };

  if (collapsible && !open) {
    return (
      <div className="flex items-center gap-2.5">
        <input type="hidden" name={name} value={effective} />
        <span className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--o-edge)] bg-[var(--o-inset)] px-3.5 py-2.5">
          <span className="text-[18px]">{current?.emoji ?? "✨"}</span>
          <span className="truncate text-[14px] font-bold text-charcoal">
            {current?.label ?? "Autre"}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-xl border border-[var(--o-edge)] bg-[var(--o-inset)] px-3.5 py-2.5 text-[12.5px] font-bold text-[#5b3fd1]"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div>
      <input type="hidden" name={name} value={effective} />
      <div className="grid grid-cols-3 gap-2">
        {BUSINESS_TYPES.map((t) => {
          const active = effective === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => choose(t.key)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition active:scale-[0.97] ${
                active
                  ? "border-[#5b3fd1] bg-[#5b3fd1]/20 ring-1 ring-[#5b3fd1]/40"
                  : "border-[var(--o-edge)] bg-[var(--o-inset)] hover:bg-[var(--o-inset)]"
              }`}
            >
              <span className="text-[20px] leading-none">{t.emoji}</span>
              <span
                className={`text-[10.5px] font-semibold leading-tight ${
                  active ? "text-[#5b3fd1]" : "text-slate"
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
