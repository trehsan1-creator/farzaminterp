import Link from "next/link";
import { PageHeading, Alert, EmptyState, UnconfiguredState, FiscalYearRequiredState } from "@/components/ui/states";
import { resolveScope } from "@/modules/queries/scope";
import { getDashboardCounts } from "@/modules/queries";
import { toFaDigits } from "@/lib/display";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ fy?: string }>;
}

/**
 * Company dashboard shell: fiscal-year-scoped KPI cards with honest
 * values only (0 = no records; never fabricated figures).
 */
export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading
          title="داشبورد مالی"
          subtitle="نمای کلی عملکرد مالی در سال مالی انتخاب‌شده"
        />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company") {
    return (
      <>
        <PageHeading title="داشبورد مالی" />
        <EmptyState title="شرکتی ثبت نشده است">
          پیش از هر چیز، فضای کاری شرکت باید در پایگاه داده تعریف شود (مهاجرت ۰۰۱۱).
        </EmptyState>
      </>
    );
  }
  if (scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="داشبورد مالی" />
        <EmptyState title="سال مالی تعریف نشده است">
          سال‌های مالی (از جمله ۱۴۰۴) باید پیش از ثبت هر سند مالی ساخته شوند.
        </EmptyState>
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading
          title="داشبورد مالی"
          subtitle="نمای کلی عملکرد مالی در سال مالی انتخاب‌شده"
        />
        <FiscalYearRequiredState />
      </>
    );
  }

  const countsRes = await getDashboardCounts(scope.scope);
  const counts = countsRes.ok
    ? countsRes.data
    : { documents: 0, importBatches: 0, openIssues: 0, readyBatches: 0 };

  const fyLabel = toFaDigits(scope.fiscalYear.label);
  const isEmpty =
    counts.documents === 0 &&
    counts.importBatches === 0 &&
    counts.openIssues === 0 &&
    counts.readyBatches === 0;

  return (
    <>
      <PageHeading
        title={`داشبورد مالی ${fyLabel}`}
        subtitle={`سال مالی ${fyLabel} — ${scope.fiscalYear.start_date} تا ${scope.fiscalYear.end_date} (فضای بازسازی)`}
        actions={
          <Link href="/imports" className="fz-btn fz-btn-primary">
            ورود اطلاعات جدید
          </Link>
        }
      />

      {!countsRes.ok ? <UnconfiguredState /> : null}

      {isEmpty ? (
        <Alert tone="info" title="هنوز داده‌ای در این سال مالی ثبت نشده است">
          این ارقام صفر هستند چون واقعاً رکوردی وجود ندارد؛ هیچ داده‌ای برای پر کردن
          داشبورد ساخته نمی‌شود. اولین قدم، ثبت فایل منبع در مانیتور ورود اطلاعات است.
        </Alert>
      ) : null}

      <section className="fz-kpi-grid" aria-label="شاخص‌های مالی">
        <Kpi label="اسناد ثبت‌شده" value={counts.documents} unit="سند" />
        <Kpi label="دسته‌های ورود اطلاعات" value={counts.importBatches} unit="دسته" />
        <Kpi label="خطاهای باز اعتبارسنجی" value={counts.openIssues} unit="مورد" />
        <Kpi label="دسته‌های آماده انتشار" value={counts.readyBatches} unit="دسته" />
      </section>

      <section className="fz-grid-2" aria-label="دسترسی‌سریع">
        <div className="fz-card">
          <h2 className="fz-card-title">ورود اطلاعات مالی</h2>
          <p style={{ marginBlockStart: "var(--fz-space-2)", color: "var(--fz-text-secondary)" }}>
            ثبت فایل منبع، تأیید اثر انگشت، نرمال‌سازی، اعتبارسنجی، تشخیص تکراری، تطبیق و
            انتشار مجوزدار — به‌صورت تکرارپذیر و بدون رکورد تکراری.
          </p>
          <p style={{ marginBlockStart: "var(--fz-space-3)" }}>
            <Link href="/imports">رفتن به مانیتور ورود اطلاعات</Link>
          </p>
        </div>
        <div className="fz-card">
          <h2 className="fz-card-title">کیفیت داده</h2>
          <p style={{ marginBlockStart: "var(--fz-space-2)", color: "var(--fz-text-secondary)" }}>
            رکوردهای نامعتبر یا مبهم هرگز اصلاح خودکار نمی‌شوند؛ در صف استثناها برای بررسی
            انسانی ثبت می‌شوند.
          </p>
          <p style={{ marginBlockStart: "var(--fz-space-3)" }}>
            <Link href="/validation">رفتن به صف اعتبارسنجی</Link>
          </p>
        </div>
      </section>
    </>
  );
}

function Kpi({ label, value, unit }: { label: string; value: number; unit: string }) {
  const display = value === 0 ? "۰" : toFaDigits(String(value));
  return (
    <div className="fz-kpi">
      <span className="fz-kpi-label">{label}</span>
      <span className="fz-kpi-value" data-empty={value === 0 ? "true" : "false"}>
        {display}
      </span>
      <span className="fz-kpi-note">
        {value === 0 ? `بدون ${unit} ثبت‌شده` : unit}
      </span>
    </div>
  );
}
