/**
 * Page-level scope resolution: explicit fiscal-year selection + company.
 * Screens must never fall back to the current date or another year.
 */

import { getCompany, listFiscalYears } from "@/modules/queries";
import { hasDatabaseConfig } from "@/lib/env";
import type { CompanyRow, FiscalYearRow } from "@/db/types";

export type ScopeResolution =
  | { kind: "unconfigured" }
  | { kind: "no_company" }
  | { kind: "no_fiscal_years" }
  | { kind: "no_selection"; fiscalYears: FiscalYearRow[]; company: CompanyRow | null }
  | {
      kind: "ok";
      company: CompanyRow;
      fiscalYear: FiscalYearRow;
      fiscalYears: FiscalYearRow[];
      scope: { companyId: string; fiscalYearId: string };
    };

export async function resolveScope(
  searchParams: { fy?: string | string[] },
): Promise<ScopeResolution> {
  if (!hasDatabaseConfig()) return { kind: "unconfigured" };

  const companyRes = await getCompany();
  if (!companyRes.ok) return { kind: "unconfigured" };
  const company = companyRes.data;
  if (!company) return { kind: "no_company" };

  const fyRes = await listFiscalYears(company.id);
  if (!fyRes.ok) return { kind: "unconfigured" };
  const fiscalYears = fyRes.data;
  if (fiscalYears.length === 0) return { kind: "no_fiscal_years" };

  const raw = Array.isArray(searchParams.fy) ? searchParams.fy[0] : searchParams.fy;
  const fiscalYear = fiscalYears.find((f) => f.id === raw);
  if (!fiscalYear) {
    return { kind: "no_selection", fiscalYears, company };
  }

  return {
    kind: "ok",
    company,
    fiscalYear,
    fiscalYears,
    scope: { companyId: company.id, fiscalYearId: fiscalYear.id },
  };
}
