import Link from "next/link";
import {
  PageHeading,
  EmptyState,
  UnconfiguredState,
  FiscalYearRequiredState,
  Badge,
} from "@/components/ui/states";
import { resolveScope } from "@/modules/queries/scope";
import { listImportBatches } from "@/modules/queries";
import { batchStatusBadge, displayDateTime, stageLabel, toFaDigits } from "@/lib/display";

export const dynamic = "force-dynamic";

const PIPELINE_STEPS_FA = [
  "ثبت فایل منبع",
  "تأیید اثر انگشت فایل",
  "ایجاد دسته ورود (کلید یکتای تکرارپذیر)",
  "نگهداری نسخه خام",
  "نرمال‌سازی داده",
  "اعتبارسنجی مرحله‌بندی‌شده",
  "تشخیص تکراری‌ها",
  "تطبیق با انتظارات منبع",
  "انتشار مجوزدار",
];

interface Props {
  searchParams: Promise<{ fy?: string }>;
}

/** Import batch monitor: stage/status of every FY1404 import run. */
export default async function ImportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="مانیتور ورود اطلاعات" subtitle="وضعیت دسته‌های ورود در سال مالی انتخاب‌شده" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="مانیتور ورود اطلاعات" />
        <EmptyState title="فضای کاری سال مالی آماده نیست" />
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="مانیتور ورود اطلاعات" subtitle="وضعیت دسته‌های ورود در سال مالی انتخاب‌شده" />
        <FiscalYearRequiredState />
      </>
    );
  }

  const batchesRes = await listImportBatches(scope.scope);
  const fyLabel = toFaDigits(scope.fiscalYear.label);

  return (
    <>
      <PageHeading
        title={`مانیتور ورود اطلاعات ${fyLabel}`}
        subtitle="هر دسته، یک فایل منبع با اثر انگشت یکتا — اجرای مجدد همان فایل، دسته جدیدی نمی‌سازد"
        actions={
          <Link href="/imports/review" className="fz-btn fz-btn-primary">
            بازبینی ورود اطلاعات
          </Link>
        }
      />

      <section aria-label="مراحل خط لوله ورود" className="fz-card">
        <h2 className="fz-card-title">خط لوله ورود (نسخه fy1404-import@1)</h2>
        <ol className="fz-stepper" style={{ marginBlockStart: "var(--fz-space-3)" }}>
          {PIPELINE_STEPS_FA.map((step, i) => (
            <li className="fz-step" key={step} data-state="todo">
              <span className="fz-step-index" aria-hidden="true">
                {toFaDigits(String(i + 1))}
              </span>
              <span className="fz-step-label">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {!batchesRes.ok ? (
        <UnconfiguredState />
      ) : batchesRes.data.length === 0 ? (
        <EmptyState title="هنوز دسته‌ای وارد نشده است">
          پس از ثبت اولین فایل منبع (از طریق API نسخه‌دار یا سرویس ورود)، وضعیت دسته‌ها
          در همین صفحه دیده می‌شود. هیچ دسته آزمایشی ساخته نمی‌شود.
        </EmptyState>
      ) : (
        <div
          className="fz-table-wrap"
          role="region"
          aria-label="جدول دسته‌های ورود — قابل پیمایش افقی"
          tabIndex={0}
        >
          <table className="fz-table">
            <caption>{toFaDigits(String(batchesRes.data.length))} دسته ورود در سال مالی {fyLabel}</caption>
            <thead>
              <tr>
                <th scope="col">شناسه دسته</th>
                <th scope="col">نسخه خط لوله</th>
                <th scope="col">مرحله</th>
                <th scope="col">وضعیت</th>
                <th scope="col">خطا</th>
                <th scope="col">زمان ایجاد</th>
                <th scope="col">اقدام</th>
              </tr>
            </thead>
            <tbody>
              {batchesRes.data.map((b) => {
                const st = batchStatusBadge(b.status);
                const stats = b.stats as Record<string, unknown>;
                return (
                  <tr key={b.id}>
                    <td>
                      <span className="fz-table-id">{b.id.slice(0, 8)}…</span>
                    </td>
                    <td>
                      <span className="fz-ltr">{b.pipeline_version}</span>
                    </td>
                    <td>{stageLabel(b.stage)}</td>
                    <td>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td>
                      {b.error_summary ? (
                        <span className="fz-badge fz-badge-danger">{b.error_summary}</span>
                      ) : (
                        "—"
                      )}
                      {typeof stats["records"] === "number" ? (
                        <div className="fz-table-hint">
                          {toFaDigits(String(stats["records"]))} رکورد
                        </div>
                      ) : null}
                    </td>
                    <td className="fz-numeric">{displayDateTime(b.created_at)}</td>
                    <td>
                      <Link
                        href={`/imports/review?batch=${b.id}`}
                        className="fz-btn fz-btn-secondary"
                        style={{ minHeight: 36, fontSize: "var(--fz-text-sm)", padding: "0 var(--fz-space-3)" }}
                      >
                        بازبینی
                      </Link>
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
