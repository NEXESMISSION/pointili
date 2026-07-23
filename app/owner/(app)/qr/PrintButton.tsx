"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="w-full rounded-xl bg-brand py-3.5 text-[12px] font-bold text-white active:scale-[0.98] print:hidden"
    >
      Imprimer ✦
    </button>
  );
}
