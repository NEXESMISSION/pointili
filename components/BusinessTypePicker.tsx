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
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [sel, setSel] = useState(defaultValue || "cafe");
  return (
    <div>
      <input type="hidden" name={name} value={sel} />
      <div className="grid grid-cols-3 gap-2">
        {BUSINESS_TYPES.map((t) => {
          const active = sel === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSel(t.key)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition active:scale-[0.97] ${
                active
                  ? "border-royal bg-lilac-2 ring-1 ring-royal/30"
                  : "border-hair bg-white hover:bg-lilac-2/40"
              }`}
            >
              <span className="text-[20px] leading-none">{t.emoji}</span>
              <span
                className={`text-[10.5px] font-semibold leading-tight ${
                  active ? "text-royal" : "text-slate"
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
