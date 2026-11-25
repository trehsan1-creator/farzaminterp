import {
  PageHeading,
  EmptyState,
  UnconfiguredState,
  FiscalYearRequiredState,
  Badge,
} from "@/components/ui/states";
import { resolveScope } from "@/modules/queries/scope";
import { listDocuments } from "@/modules/queries";
import {
  displayDate,
  displayMoney,
  documentStatusBadge,
  documentTypeLabel,
  toFaDigits,
} from "@/lib/display";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ fy?: string }>;
}

/**
 * FY document registry. On mobile the table becomes a labelled horizontal
 * scroll region (design-system RESPONSIVE.md) — record identity, date,
 * amount and status stay visible.
 */
export default async function DocumentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="دفتر اسناد" subtitle="اسناد مالی سال مالی انتخاب‌شده" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="دفتر اسناد" />
        <EmptyState title="فضای کاری سال مالی آماده نیست">
          پیش از ثبت سند، شرکت و سال مالی باید در پایگاه داده تعریف شده باشند.
        </EmptyState>
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="دفتر اسناد" subtitle="اسناد مالی سال مالی انتخاب‌شده" />
        <FiscalYearRequiredState />
      </>
    );
  }

  const docsRes = await listDocuments(scope.scope);
  const fyLabel = toFaDigits(scope.fiscalYear.label);

  return (
    <>
      <PageHeading
        title={`دفتر اسناد ${fyLabel}`}
        subtitle="اسناد ثبت‌شده در سال مالی انتخاب‌شده — هر سند به منبع خود مستند است"
        actions={
          <span className="fz-btn fz-btn-secondary" aria-disabled="true" title="در مرحله بعدی">
            ثبت سند دستی
          </span>
        }
      />

      {!docsRes.ok ? (
        <UnconfiguredState />
      ) : docsRes.data.length === 0 ? (
        <EmptyState title="سندی در این سال مالی ثبت نشده است">
          دفتر اسناد پس از ورود و انتشار اولین فایل منبع پر می‌شود. هیچ سند آزمایشی یا
          نمونه‌ای برای «پر به نظر رسیدن» صفحه ساخته نمی‌شود.
        </EmptyState>
      ) : (
        <div
          className="fz-table-wrap"
          role="region"
          aria-label="جدول اسناد — قابل پیمایش افقی"
          tabIndex={0}
        >
          <table className="fz-table">
            <caption>
              {toFaDigits(String(docsRes.data.length))} سند در سال مالی {fyLabel} —
              پیمایش افقی در صفحه‌های کوچک
            </caption>
            <thead>
              <tr>
                <th scope="col">نوع سند</th>
                <th scope="col">شماره سند</th>
                <th scope="col">تاریخ سند</th>
                <th scope="col">شرح</th>
                <th scope="col" className="fz-num-th">مبلغ</th>
                <th scope="col">وضعیت</th>
                <th scope="col">منبع</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {docsRes.data.map((doc) => {
                const st = documentStatusBadge(doc.status);
                return (
                  <tr key={doc.id}>
                    <td>{documentTypeLabel(doc.document_type)}</td>
                    <td>
                      <span className="fz-table-id">{doc.document_no ?? "—"}</span>
                    </td>
                    <td className="fz-numeric">{displayDate(doc.document_date)}</td>
                    <td>{doc.description ?? "—"}</td>
                    <td className="fz-num">{displayMoney(doc.amount_total, doc.currency)}</td>
                    <td>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td>{doc.source === "import" ? "ورود فایل" : "دستی"}</td>
                    <td>
                      <button
                        type="button"
                        className="fz-btn fz-btn-secondary"
                        style={{ minHeight: 36, fontSize: "var(--fz-text-sm)", padding: "0 var(--fz-space-3)" }}
                        aria-disabled="true"
                        title="جزئیات سند در مراحل بعدی اضافه می‌شود"
                      >
                        مشاهده
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
