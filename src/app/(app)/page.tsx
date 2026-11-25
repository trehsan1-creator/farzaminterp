import Link from "next/link";
import {
  PageHeading,
  Alert,
  EmptyState,
  UnconfiguredState,
  FiscalYearRequiredState,
  Badge,
} from "@/components/ui/states";
import { resolveScope } from "@/modules/queries/scope";
import { getDashboardCounts, listDocuments } from "@/modules/queries";
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
 * Fiscal-year overview. Only persisted records are shown; the dashboard
 * never invents balances or accounting performance from unposted documents.
 */
export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="داشبورد مالی" subtitle="نمای کلی عملکرد مالی در سال مالی انتخاب‌شده" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company") {
    return (
      <>
        <PageHeading title="داشبورد مالی" />
        <EmptyState title="شرکتی ثبت نشده است">
          پیش از هر چیز، فضای کاری شرکت باید در پایگاه داده تعریف شود.
        </EmptyState>
      </>
    );
  }
  if (scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="داشبورد مالی" />
        <EmptyState title="سال مالی تعریف نشده است">
          سال مالی باید پیش از ثبت هر سند مالی ساخته شود.
        </EmptyState>
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="داشبورد مالی" subtitle="برای مشاهده اطلاعات، یک سال مالی انتخاب کنید." />
        <FiscalYearRequiredState />
      </>
    );
  }

  const [countsRes, documentsRes] = await Promise.all([
    getDashboardCounts(scope.scope),
    listDocuments(scope.scope, { limit: 6 }),
  ]);

  const counts = countsRes.ok
    ? countsRes.data
    : { documents: 0, importBatches: 0, openIssues: 0, readyBatches: 0 };
  const recentDocuments = documentsRes.ok ? documentsRes.data : [];
  const hasDemoData = recentDocuments.some((doc) => doc.document_no?.startsWith("DEMO-"));
  const fyLabel = toFaDigits(scope.fiscalYear.label);
  const currencyLabel = scope.company.base_currency === "IRR" ? "ریال" : "تومان";
  const isEmpty =
    counts.documents === 0 &&
    counts.importBatches === 0 &&
    counts.openIssues === 0 &&
    counts.readyBatches === 0;

  return (
    <>
      <PageHeading
        title={"داشبورد مالی " + fyLabel}
        subtitle="مرکز مدیریت و پایش اطلاعات مالی شرکت"
        actions={
          <Link href={"/imports?fy=" + scope.fiscalYear.id} className="fz-btn fz-btn-primary">
            <span aria-hidden="true">＋</span>
            ورود اطلاعات جدید
          </Link>
        }
      />

      <section className="fz-dashboard-context" aria-label="اطلاعات دوره مالی">
        <div className="fz-dashboard-context-copy">
          <span className="fz-dashboard-context-title">
            پرونده مالی سال {fyLabel}
            {scope.fiscalYear.is_reconstruction ? " · فضای بازسازی" : ""}
          </span>
          <span className="fz-dashboard-context-sub">
            از {displayDate(scope.fiscalYear.start_date)} تا {displayDate(scope.fiscalYear.end_date)}
            {" · "}واحد پایه: {currencyLabel}
            {" · "}اطلاعات هر سال مالی به‌صورت مستقل نگهداری می‌شود.
          </span>
        </div>
        {hasDemoData ? (
          <span className="fz-demo-pill">داده‌های نمونه آزمایشی</span>
        ) : (
          <Badge variant="info">سال مالی انتخاب‌شده</Badge>
        )}
      </section>

      {!countsRes.ok || !documentsRes.ok ? (
        <Alert tone="warning" title="بخشی از اطلاعات دریافت نشد">
          ارتباط با پایگاه داده برقرار است، اما دریافت یکی از بخش‌های داشبورد کامل نشد. صفحه را دوباره بارگذاری کنید.
        </Alert>
      ) : null}

      {isEmpty ? (
        <Alert tone="info" title="هنوز اطلاعاتی در این سال مالی ثبت نشده است">
          پس از ورود فایل‌های منبع و تکمیل بررسی آن‌ها، اطلاعات این داشبورد به‌صورت خودکار به‌روز می‌شود.
        </Alert>
      ) : null}

      <section className="fz-kpi-grid" aria-label="شاخص‌های عملیاتی سال مالی">
        <Kpi label="اسناد ثبت‌شده" value={counts.documents} unit="سند" note="در دفتر اسناد این سال مالی" tone="blue" />
        <Kpi label="دسته‌های ورود اطلاعات" value={counts.importBatches} unit="دسته" note="فایل‌های دریافت‌شده برای پردازش" tone="purple" />
        <Kpi label="خطاهای باز اعتبارسنجی" value={counts.openIssues} unit="مورد" note="نیازمند بررسی و تصمیم انسانی" tone="orange" />
        <Kpi label="آماده انتشار" value={counts.readyBatches} unit="دسته" note="پس از تکمیل کنترل‌ها و تأیید" tone="green" />
      </section>

      <div className="fz-dashboard-lower">
        <section className="fz-dashboard-panel" aria-labelledby="recent-documents-title">
          <header className="fz-dashboard-panel-head">
            <div>
              <h2 id="recent-documents-title">آخرین اسناد ثبت‌شده</h2>
              <p>آخرین رکوردهای دفتر اسناد در سال مالی {fyLabel}</p>
            </div>
            <Link className="fz-dashboard-panel-link" href={"/documents?fy=" + scope.fiscalYear.id}>
              مشاهده همه اسناد
            </Link>
          </header>
          <div className="fz-dashboard-panel-body">
            {recentDocuments.length === 0 ? (
              <EmptyState title="سندی برای نمایش وجود ندارد">
                با ورود و ثبت اولین سند، فهرست فعالیت‌های مالی اینجا نمایش داده می‌شود.
              </EmptyState>
            ) : (
              <div className="fz-table-wrap fz-dashboard-table-wrap" role="region" aria-label="آخرین اسناد، قابل پیمایش افقی" tabIndex={0}>
                <table className="fz-table">
                  <caption>{toFaDigits(String(recentDocuments.length))} سند اخیر</caption>
                  <thead>
                    <tr>
                      <th scope="col">شماره و شرح سند</th>
                      <th scope="col">نوع</th>
                      <th scope="col">تاریخ</th>
                      <th scope="col" className="fz-num-th">مبلغ ({currencyLabel})</th>
                      <th scope="col">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDocuments.map((doc) => {
                      const status = documentStatusBadge(doc.status);
                      const isDemo = doc.document_no?.startsWith("DEMO-") ?? false;
                      return (
                        <tr key={doc.id}>
                          <td>
                            <div className="fz-document-number">
                              <span className="fz-table-id">{doc.document_no ?? "بدون شماره"}</span>
                              {isDemo ? <span className="fz-document-demo-label">نمونه</span> : null}
                            </div>
                            <div className="fz-table-hint fz-document-description">{doc.description ?? "بدون شرح"}</div>
                          </td>
                          <td>{documentTypeLabel(doc.document_type)}</td>
                          <td className="fz-numeric">{displayDate(doc.document_date)}</td>
                          <td className="fz-num">{displayMoney(doc.amount_total, doc.currency)}</td>
                          <td><Badge variant={status.variant}>{status.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <aside className="fz-dashboard-side-stack">
          <section className="fz-dashboard-panel" aria-labelledby="processing-status-title">
            <header className="fz-dashboard-panel-head">
              <div>
                <h2 id="processing-status-title">وضعیت پردازش اطلاعات</h2>
                <p>نمای کلی صف ورود و کنترل کیفیت</p>
              </div>
              <Badge variant={counts.openIssues > 0 ? "warning" : "success"}>
                {counts.openIssues > 0 ? "نیازمند بررسی" : "بدون خطای باز"}
              </Badge>
            </header>
            <div className="fz-dashboard-panel-body">
              <div className="fz-dashboard-stat-list">
                <div className="fz-dashboard-stat">
                  <span className="fz-dashboard-stat-label">دسته‌های دریافت‌شده</span>
                  <strong className="fz-dashboard-stat-value">{toFaDigits(String(counts.importBatches))}</strong>
                </div>
                <div className="fz-dashboard-stat">
                  <span className="fz-dashboard-stat-label">خطاهای باز</span>
                  <strong className="fz-dashboard-stat-value">{toFaDigits(String(counts.openIssues))}</strong>
                </div>
                <div className="fz-dashboard-stat">
                  <span className="fz-dashboard-stat-label">آماده انتشار</span>
                  <strong className="fz-dashboard-stat-value">{toFaDigits(String(counts.readyBatches))}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="fz-dashboard-panel" aria-labelledby="quick-access-title">
            <header className="fz-dashboard-panel-head">
              <div>
                <h2 id="quick-access-title">دسترسی سریع</h2>
                <p>مسیرهای پرکاربرد این مرحله</p>
              </div>
            </header>
            <div className="fz-dashboard-panel-body">
              <div className="fz-dashboard-actions">
                <QuickAction href={"/imports?fy=" + scope.fiscalYear.id} title="ورود فایل و اطلاعات" description="شروع یک فرایند ورود جدید" />
                <QuickAction href={"/documents?fy=" + scope.fiscalYear.id} title="دفتر اسناد" description="مرور اسناد ثبت‌شده" />
                <QuickAction href={"/validation?fy=" + scope.fiscalYear.id} title="صف کنترل کیفیت" description="بررسی خطاها و موارد مبهم" />
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  note: string;
  tone: "blue" | "purple" | "orange" | "green";
}) {
  return (
    <div className="fz-kpi" data-tone={tone}>
      <span className="fz-kpi-label">{label}</span>
      <strong className="fz-kpi-value" data-empty={value === 0 ? "true" : "false"}>
        {toFaDigits(String(value))}
      </strong>
      <span className="fz-kpi-note">{value === 0 ? "فعلاً بدون " + unit + " ثبت‌شده" : note}</span>
    </div>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="fz-dashboard-action">
      <span>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <span className="fz-dashboard-action-arrow" aria-hidden="true">←</span>
    </Link>
  );
}
