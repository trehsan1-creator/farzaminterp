import Link from "next/link";
import {
  PageHeading,
  EmptyState,
  UnconfiguredState,
  FiscalYearRequiredState,
  Badge,
  Alert,
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

/** Fiscal-year document register. Financial facts remain read-only in Stage 00. */
export default async function DocumentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="دفتر اسناد" subtitle="فهرست اسناد مالی سال انتخاب‌شده" />
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
        <PageHeading title="دفتر اسناد" subtitle="برای مشاهده اسناد، یک سال مالی انتخاب کنید." />
        <FiscalYearRequiredState />
      </>
    );
  }

  const docsRes = await listDocuments(scope.scope);
  const fyLabel = toFaDigits(scope.fiscalYear.label);

  if (!docsRes.ok) {
    return (
      <>
        <PageHeading title={"دفتر اسناد " + fyLabel} />
        <UnconfiguredState />
      </>
    );
  }

  const hasDemoData = docsRes.data.some((doc) => doc.document_no?.startsWith("DEMO-"));
  const demoCount = docsRes.data.filter((doc) => doc.document_no?.startsWith("DEMO-")).length;

  return (
    <>
      <PageHeading
        title={"دفتر اسناد " + fyLabel}
        subtitle="فهرست متمرکز اسناد ثبت‌شده؛ هر سند در محدوده سال مالی خودش نگهداری می‌شود."
        actions={
          <Link href={"/imports?fy=" + scope.fiscalYear.id} className="fz-btn fz-btn-primary">
            <span aria-hidden="true">＋</span>
            ورود فایل منبع
          </Link>
        }
      />

      {hasDemoData ? (
        <Alert tone="info" title="این فهرست شامل داده‌های نمونه آزمایشی است">
          {toFaDigits(String(demoCount))} سند با شناسه DEMO برای بررسی رابط کاربری ثبت شده است. این رکوردها سند قطعی حسابداری یا مانده واقعی شرکت نیستند.
        </Alert>
      ) : null}

      <section className="fz-dashboard-panel" aria-label="فهرست اسناد مالی">
        <header className="fz-dashboard-panel-head">
          <div>
            <h2>اسناد سال مالی {fyLabel}</h2>
            <p>{toFaDigits(String(docsRes.data.length))} رکورد در محدوده انتخاب‌شده</p>
          </div>
          <Badge variant="neutral">واحد پایه: {scope.company.base_currency === "IRR" ? "ریال" : "تومان"}</Badge>
        </header>

        {docsRes.data.length === 0 ? (
          <div className="fz-dashboard-panel-body">
            <EmptyState title="سندی در این سال مالی ثبت نشده است">
              پس از ورود فایل منبع و تکمیل فرایند بررسی، اسناد معتبر در این دفتر نمایش داده می‌شوند.
            </EmptyState>
          </div>
        ) : (
          <div className="fz-table-wrap fz-table-wrap-panel" role="region" aria-label="جدول اسناد، قابل پیمایش افقی" tabIndex={0}>
            <table className="fz-table">
              <caption>
                {toFaDigits(String(docsRes.data.length))} سند در سال مالی {fyLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col">شماره سند</th>
                  <th scope="col">نوع سند</th>
                  <th scope="col">تاریخ</th>
                  <th scope="col">شرح</th>
                  <th scope="col" className="fz-num-th">مبلغ</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">نحوه ثبت</th>
                </tr>
              </thead>
              <tbody>
                {docsRes.data.map((doc) => {
                  const status = documentStatusBadge(doc.status);
                  const isDemo = doc.document_no?.startsWith("DEMO-") ?? false;
                  return (
                    <tr key={doc.id}>
                      <td>
                        <div className="fz-document-number">
                          <span className="fz-table-id">{doc.document_no ?? "—"}</span>
                          {isDemo ? <span className="fz-document-demo-label">نمونه</span> : null}
                        </div>
                      </td>
                      <td>{documentTypeLabel(doc.document_type)}</td>
                      <td className="fz-numeric">{displayDate(doc.document_date)}</td>
                      <td>
                        <span className="fz-document-description" title={doc.description ?? undefined}>
                          {doc.description ?? "بدون شرح"}
                        </span>
                      </td>
                      <td className="fz-num">{displayMoney(doc.amount_total, doc.currency)}</td>
                      <td><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td>{isDemo ? "داده آزمایشی" : doc.source === "import" ? "ورود فایل" : "ثبت دستی"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
