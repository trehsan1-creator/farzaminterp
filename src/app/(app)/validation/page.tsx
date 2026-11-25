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
import { listValidationIssues } from "@/modules/queries";
import { displayDateTime, severityBadge, toFaDigits } from "@/lib/display";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ fy?: string; severity?: string }>;
}

const SEVERITIES = [
  { id: "", label: "همه موارد" },
  { id: "error", label: "خطاها" },
  { id: "warning", label: "هشدارها" },
  { id: "info", label: "اطلاع‌رسانی" },
] as const;

/** Human review queue for invalid or ambiguous source data. */
export default async function ValidationPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="کیفیت داده و استثناها" subtitle="صف بررسی موارد نامعتبر یا مبهم" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="کیفیت داده و استثناها" />
        <EmptyState title="فضای کاری سال مالی آماده نیست" />
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="کیفیت داده و استثناها" subtitle="برای مشاهده موارد، یک سال مالی انتخاب کنید." />
        <FiscalYearRequiredState />
      </>
    );
  }

  const severity = params.severity && SEVERITIES.some((item) => item.id === params.severity)
    ? params.severity
    : "";
  const issuesRes = await listValidationIssues({
    companyId: scope.scope.companyId,
    fiscalYearId: scope.scope.fiscalYearId,
    status: "open",
  });

  const all = issuesRes.ok ? issuesRes.data : [];
  const rows = severity ? all.filter((issue) => issue.severity === severity) : all;
  const fyLabel = toFaDigits(scope.fiscalYear.label);
  const counts = {
    error: all.filter((issue) => issue.severity === "error").length,
    warning: all.filter((issue) => issue.severity === "warning").length,
    info: all.filter((issue) => issue.severity === "info").length,
  };

  return (
    <>
      <PageHeading
        title={"کیفیت داده و استثناها " + fyLabel}
        subtitle="موارد مبهم یا نامعتبر برای تصمیم انسانی در این صف نگهداری می‌شوند؛ اصلاح خودکار انجام نمی‌شود."
      />

      {!issuesRes.ok ? (
        <UnconfiguredState />
      ) : all.length === 0 ? (
        <Alert tone="success" title="مورد بازی برای بررسی وجود ندارد">
          در حال حاضر هیچ خطا، هشدار یا مورد اطلاع‌رسانی بازی برای سال مالی {fyLabel} ثبت نشده است.
        </Alert>
      ) : null}

      <section className="fz-validation-summary" aria-label="خلاصه موارد باز">
        <SummaryItem label="کل موارد باز" value={all.length} tone="neutral" />
        <SummaryItem label="خطاها" value={counts.error} tone="danger" />
        <SummaryItem label="هشدارها" value={counts.warning} tone="warning" />
        <SummaryItem label="اطلاع‌رسانی" value={counts.info} tone="info" />
      </section>

      <section className="fz-dashboard-panel" aria-labelledby="validation-queue-title">
        <header className="fz-dashboard-panel-head">
          <div>
            <h2 id="validation-queue-title">صف بررسی انسانی</h2>
            <p>فقط موارد باز در سال مالی انتخاب‌شده</p>
          </div>
          <Badge variant={all.length > 0 ? "warning" : "success"}>
            {all.length > 0 ? toFaDigits(String(all.length)) + " مورد باز" : "بدون مورد باز"}
          </Badge>
        </header>

        <div className="fz-dashboard-panel-body">
          <nav className="fz-filter-row fz-validation-filters" aria-label="فیلتر شدت مشکل">
            {SEVERITIES.map((item) => {
              const selected = severity === item.id;
              const count = item.id === "" ? all.length : counts[item.id];
              const href = item.id
                ? "/validation?fy=" + scope.fiscalYear.id + "&severity=" + item.id
                : "/validation?fy=" + scope.fiscalYear.id;
              return (
                <Link
                  key={item.id || "all"}
                  href={href}
                  className="fz-btn fz-btn-secondary"
                  data-active={selected ? "true" : "false"}
                  aria-current={selected ? "page" : undefined}
                >
                  {item.label}
                  <span className="fz-filter-count">{toFaDigits(String(count))}</span>
                </Link>
              );
            })}
          </nav>

          {issuesRes.ok && rows.length === 0 ? (
            <EmptyState title={severity ? "موردی با این فیلتر وجود ندارد" : "صف بررسی خالی است"}>
              {severity
                ? "شدت دیگری را انتخاب کنید یا همه موارد را ببینید."
                : "پس از اجرای اعتبارسنجی روی فایل‌های ورودی، موارد نیازمند بررسی در اینجا نمایش داده می‌شوند."}
            </EmptyState>
          ) : issuesRes.ok ? (
            <div className="fz-table-wrap" role="region" aria-label="جدول استثناها، قابل پیمایش افقی" tabIndex={0}>
              <table className="fz-table">
                <caption>{toFaDigits(String(rows.length))} مورد در صف بررسی</caption>
                <thead>
                  <tr>
                    <th scope="col">شدت</th>
                    <th scope="col">کد</th>
                    <th scope="col">شرح مسئله</th>
                    <th scope="col">مرجع منبع</th>
                    <th scope="col">فیلد</th>
                    <th scope="col">زمان ثبت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((issue) => {
                    const status = severityBadge(issue.severity);
                    return (
                      <tr key={issue.id}>
                        <td><Badge variant={status.variant}>{status.label}</Badge></td>
                        <td><span className="fz-table-id">{issue.code}</span></td>
                        <td>{issue.message_fa}</td>
                        <td><span className="fz-table-id">{issue.source_ref ?? "—"}</span></td>
                        <td><span className="fz-ltr">{issue.field ?? "—"}</span></td>
                        <td className="fz-numeric">{displayDateTime(issue.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "danger" | "warning" | "info";
}) {
  return (
    <div className="fz-validation-summary-item" data-tone={tone}>
      <span>{label}</span>
      <strong>{toFaDigits(String(value))}</strong>
    </div>
  );
}
