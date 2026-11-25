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
  "ایجاد دسته ورود یکتا",
  "نگهداری نسخه خام",
  "نرمال‌سازی داده",
  "اعتبارسنجی مرحله‌ای",
  "تشخیص رکورد تکراری",
  "تطبیق با منبع",
  "انتشار پس از تأیید",
];

interface Props {
  searchParams: Promise<{ fy?: string }>;
}

/** Import monitor: source intake and processing state for the selected year. */
export default async function ImportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="ورود اطلاعات" subtitle="دریافت، کنترل و آماده‌سازی اسناد مالی" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="ورود اطلاعات" />
        <EmptyState title="فضای کاری سال مالی آماده نیست" />
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="ورود اطلاعات" subtitle="برای شروع، یک سال مالی انتخاب کنید." />
        <FiscalYearRequiredState />
      </>
    );
  }

  const batchesRes = await listImportBatches(scope.scope);
  const fyLabel = toFaDigits(scope.fiscalYear.label);

  if (!batchesRes.ok) {
    return (
      <>
        <PageHeading title={"ورود اطلاعات " + fyLabel} />
        <UnconfiguredState />
      </>
    );
  }

  return (
    <>
      <PageHeading
        title={"ورود اطلاعات " + fyLabel}
        subtitle="فایل‌های مالی را دریافت کنید و پیش از ورود به سوابق قطعی، آن‌ها را مرحله‌به‌مرحله بررسی کنید."
        actions={
          <Link href={"/imports/review?fy=" + scope.fiscalYear.id} className="fz-btn fz-btn-secondary">
            مشاهده صف بازبینی
          </Link>
        }
      />

      <section className="fz-import-intro">
        <div className="fz-import-intro-icon" aria-hidden="true">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3m0 0L8 7m4-4 4 4" />
            <path d="M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13" />
          </svg>
        </div>
        <div className="fz-import-intro-copy">
          <h2>از فایل خام تا سند قابل اتکا</h2>
          <p>
            هر فایل ابتدا به‌عنوان منبع نگهداری می‌شود. داده‌ها پس از نرمال‌سازی، کنترل تکراری‌ها و تطبیق بررسی می‌شوند؛ هیچ موردی بدون مجوز وارد ثبت قطعی نمی‌شود.
          </p>
        </div>
        <div className="fz-import-intro-meta">
          <span>سال مالی</span>
          <strong>{fyLabel}</strong>
        </div>
      </section>

      <section className="fz-card" aria-labelledby="pipeline-title">
        <div className="fz-section-heading">
          <div>
            <h2 id="pipeline-title">مراحل پردازش فایل</h2>
            <p>مسیر استانداردی که هر منبع مالی طی می‌کند</p>
          </div>
          <Badge variant="info">۹ مرحله کنترل</Badge>
        </div>
        <ol className="fz-stepper fz-import-stepper">
          {PIPELINE_STEPS_FA.map((step, index) => (
            <li className="fz-step" key={step} data-state="todo">
              <span className="fz-step-index" aria-hidden="true">{toFaDigits(String(index + 1))}</span>
              <span className="fz-step-label">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="fz-dashboard-panel" aria-labelledby="import-batches-title">
        <header className="fz-dashboard-panel-head">
          <div>
            <h2 id="import-batches-title">دسته‌های ورود اطلاعات</h2>
            <p>سوابق دریافت و پردازش فایل‌ها در سال مالی {fyLabel}</p>
          </div>
          <Badge variant={batchesRes.data.length > 0 ? "info" : "neutral"}>
            {toFaDigits(String(batchesRes.data.length))} دسته
          </Badge>
        </header>

        {batchesRes.data.length === 0 ? (
          <div className="fz-dashboard-panel-body">
            <EmptyState title="هنوز فایلی برای پردازش دریافت نشده است">
              پس از اتصال جریان دریافت فایل، هر بار ثبت منبع یک دسته مستقل و قابل پیگیری در این فهرست ایجاد می‌کند.
            </EmptyState>
          </div>
        ) : (
          <div className="fz-table-wrap fz-table-wrap-panel" role="region" aria-label="دسته‌های ورود، قابل پیمایش افقی" tabIndex={0}>
            <table className="fz-table">
              <caption>{toFaDigits(String(batchesRes.data.length))} دسته ورود در سال مالی {fyLabel}</caption>
              <thead>
                <tr>
                  <th scope="col">شناسه دسته</th>
                  <th scope="col">نسخه خط لوله</th>
                  <th scope="col">مرحله فعلی</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">رکورد / خطا</th>
                  <th scope="col">زمان ایجاد</th>
                  <th scope="col">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {batchesRes.data.map((batch) => {
                  const status = batchStatusBadge(batch.status);
                  const stats = batch.stats as Record<string, unknown>;
                  return (
                    <tr key={batch.id}>
                      <td><span className="fz-table-id">{batch.id.slice(0, 8)}…</span></td>
                      <td><span className="fz-ltr">{batch.pipeline_version}</span></td>
                      <td>{stageLabel(batch.stage)}</td>
                      <td><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td>
                        {batch.error_summary ? (
                          <Badge variant="danger">{batch.error_summary}</Badge>
                        ) : typeof stats.records === "number" ? (
                          toFaDigits(String(stats.records)) + " رکورد"
                        ) : "—"}
                      </td>
                      <td className="fz-numeric">{displayDateTime(batch.created_at)}</td>
                      <td>
                        <Link
                          href={"/imports/review?fy=" + scope.fiscalYear.id + "&batch=" + batch.id}
                          className="fz-btn fz-btn-secondary fz-btn-compact"
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
      </section>
    </>
  );
}
