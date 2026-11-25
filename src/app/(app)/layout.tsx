import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { getCompany, listFiscalYears } from "@/modules/queries";
import { hasDatabaseConfig } from "@/lib/env";

/**
 * Application shell layout: company context + fiscal-year options are
 * loaded server-side once; pages consume the explicit ?fy= selection.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const dbConfigured = hasDatabaseConfig();
  let company: { nameFa: string; baseCurrency: string } | null = null;
  let fiscalYears: Array<{ id: string; label: string; status: string }> = [];

  if (dbConfigured) {
    const companyRes = await getCompany();
    if (companyRes.ok && companyRes.data) {
      company = {
        nameFa: companyRes.data.name_fa,
        baseCurrency: companyRes.data.base_currency,
      };
      const fyRes = await listFiscalYears(companyRes.data.id);
      if (fyRes.ok) {
        fiscalYears = fyRes.data.map((fy) => ({
          id: fy.id,
          label: fy.label,
          status: fy.status,
        }));
      }
    }
  }

  return (
    <AppShell company={company} fiscalYears={fiscalYears} dbConfigured={dbConfigured}>
      {children}
    </AppShell>
  );
}
