import type { DocumentRow, ImportBatchRow } from "@/db/types";
import { batchStatusBadge, documentTypeLabel } from "@/lib/display";
import { parseIsoDate, toJalali } from "@/lib/jalali";

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
] as const;

export interface DashboardVisuals {
  monthlyDocuments: Array<{ month: string; value: number }>;
  datedDocuments: number;
  documentTypes: Array<{ type: string; label: string; value: number }>;
  batchStatuses: Array<{ status: string; label: string; value: number }>;
}

/**
 * Aggregates only persisted rows already scoped to the selected company
 * and fiscal year. These are operational analytics, not financial statements.
 */
export function buildDashboardVisuals(
  documents: DocumentRow[],
  batches: ImportBatchRow[],
): DashboardVisuals {
  const monthlyDocuments = JALALI_MONTHS.map((month) => ({ month, value: 0 }));
  let datedDocuments = 0;
  const typeCounts = new Map<string, number>();
  const batchCounts = new Map<string, number>();

  for (const document of documents) {
    const date = document.document_date ? parseIsoDate(document.document_date) : null;
    if (date) {
      const jalali = toJalali(date);
      const month = monthlyDocuments[jalali.jm - 1];
      if (month) {
        month.value += 1;
        datedDocuments += 1;
      }
    }

    const type = document.document_type || "other";
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  for (const batch of batches) {
    const status = batch.status || "unknown";
    batchCounts.set(status, (batchCounts.get(status) ?? 0) + 1);
  }

  const documentTypes = Array.from(typeCounts, ([type, value]) => ({
    type,
    label: documentTypeLabel(type),
    value,
  })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fa"));

  const batchStatuses = Array.from(batchCounts, ([status, value]) => ({
    status,
    label: batchStatusBadge(status).label,
    value,
  })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fa"));

  return { monthlyDocuments, datedDocuments, documentTypes, batchStatuses };
}
