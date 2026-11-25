"use client";

/**
 * Explicit fiscal-year selector (top bar). Figures on a page always depend
 * on an explicit selection — the selector never defaults to "today"; it
 * only preserves an explicit ?fy= choice or shows a required-selection
 * state when none is made.
 */

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toFaDigits } from "@/lib/display";

export interface FiscalYearOption {
  id: string;
  label: string;
  status: string;
}

function FiscalYearSelectInner({ fiscalYears }: { fiscalYears: FiscalYearOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = searchParams.get("fy") ?? "";

  const onChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("fy", value);
      else params.delete("fy");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  if (fiscalYears.length === 0) {
    return (
      <div className="fz-fy-select">
        <label htmlFor="fy-select">سال مالی</label>
        <select id="fy-select" className="fz-select" disabled value="">
          <option>تعریف نشده</option>
        </select>
      </div>
    );
  }

  return (
    <div className="fz-fy-select">
      <label htmlFor="fy-select">سال مالی</label>
      <select
        id="fy-select"
        className="fz-select"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">— انتخاب کنید —</option>
        {fiscalYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {toFaDigits(fy.label)}
            {fy.status === "open" ? "" : ` (${fy.status === "closed" ? "بسته" : "قفل‌شده"})`}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FiscalYearSelect({ fiscalYears }: { fiscalYears: FiscalYearOption[] }) {
  return (
    <Suspense fallback={<span className="fz-topbar-env">سال مالی…</span>}>
      <FiscalYearSelectInner fiscalYears={fiscalYears} />
    </Suspense>
  );
}
