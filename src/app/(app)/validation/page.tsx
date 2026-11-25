import {
  PageHeading,
  EmptyState,
  UnconfiguredState,
  FiscalYearRequiredState,
  Badge,
} from "@/components/ui/states";
import { resolveScope } from "@/modules/queries/scope";
import { listValidationIssues } from "@/modules/queries";
import { displayDateTime, severityBadge, toFaDigits } from "@/lib/display";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ fy?: string; severity?: string }>;
}

const SEVERITIES = [
  { id: "", label: "همه" },
  { id: "error", label: "خطاها" },
  { id: "warning", label: "هشدارها" },
  { id: "info", label: "اطلاعات" },
];

/**
 * Data validation & exception queue: uncertain or invalid source data is
 * surfaced for human review — never auto-corrected, never discarded.
 */
export default async function ValidationPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="اعتبارسنجی و استثناها" subtitle="صف بررسی داده‌های نامعتبر یا مبهم" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="اعتبارسنجی و استثناها" />
        <EmptyState title="فضای کاری سال مالی آماده نیست" />
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="اعتبارسنجی و استثناها" subtitle="صف بررسی داده‌های نامعتبر یا مبهم" />
        <FiscalYearRequiredState />
      </>
    );
  }

  const severity = params.severity && SEVERITIES.some((s) => s.id === params.severity)
    ? params.severity
    : "";
  const issuesRes = await listValidationIssues({
    companyId: scope.scope.companyId,
    fiscalYearId: scope.scope.fiscalYearId,
    status: "open",
  });

  const all = issuesRes.ok ? issuesRes.data : [];
  const rows = severity ? all.filter((i) => i.severity === severity) : all;
  const fyLabel = toFaDigits(scope.fiscalYear.label);

  return (
    <>
      <PageHeading
        title={`اعتبارسنجی و استثناها ${fyLabel}`}
        subtitle="رکوردهای نامعتبر یا مبهم هرگز خودکار اصلاح نمی‌شوند؛ برای تصمیم انسانی اینجا ثبت می‌شوند"
      />

      <nav className="fz-filter-row" aria-label="فیل شدت مشکل">
        {SEVERITIES.map((s) => (
          <Link
            key={s.id}
            href={s.id ? `/validation?fy=${scope.fiscalYear.id}&severity=${s.id}` : `/validation?fy=${scope.fiscalYear.id}`}
            className="fz-btn fz-btn-secondary"
            data-active={(severity === s.id || (s.id === "" && severity === "")) ? "true" : "false"}
            aria-current={severity === s.id ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {!issuesRes.ok ? (
        <UnconfiguredState />
      ) : rows.length === 0 ? (
        <EmptyState title={severity ? "موردی با این فیلتر وجود ندارد" : "استثنای بازی ثبت نشده است"}>
          {severity
            ? "فیل دیگری را انتخاب کنید یا همه موارد را ببینید."
            : "پس از اجرای اعتبارسنجی روی دسته‌های ورود، موارد نامعتبر با کد و پیام فارسی در این صف ظاهر می‌شوند."}
        </EmptyState>
      ) : (
        <div
          className="fz-table-wrap"
          role="region"
          aria-label="جدول استثناها — قابل پیمایش افقی"
          tabIndex={0}
        >
          <table className="fz-table">
            <caption>{toFaDigits(String(rows.length))} مورد باز</caption>
            <thead>
              <tr>
                <th scope="col">شدت</th>
                <th scope="col">کد</th>
                <th scope="col">پیام</th>
                <th scope="col">مرجع</th>
                <th scope="col">فیلد</th>
                <th scope="col">زمان ثبت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => {
                const sv = severityBadge(issue.severity);
                return (
                  <tr key={issue.id}>
                    <td>
                      <Badge variant={sv.variant}>{sv.label}</Badge>
                    </td>
                    <td>
                      <span className="fz-table-id">{issue.code}</span>
                    </td>
                    <td>{issue.message_fa}</td>
                    <td>{issue.source_ref ?? "—"}</td>
                    <td>
                      <span className="fz-ltr">{issue.field ?? "—"}</span>
                    </td>
                    <td className="fz-numeric">{displayDateTime(issue.created_at)}</td>
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
