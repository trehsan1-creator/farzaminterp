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
import {
  getBatchSourceFile,
  listImportBatches,
  listStagingRecords,
  listValidationIssues,
} from "@/modules/queries";
import {
  batchStatusBadge,
  displayDate,
  displayDateTime,
  displayMoney,
  duplicateStatusBadge,
  postStatusBadge,
  recordKindLabel,
  shortId,
  stageLabel,
  stageProgressState,
  toFaDigits,
  validationStatusBadge,
  PIPELINE_STAGE_ORDER,
} from "@/lib/display";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ fy?: string; batch?: string }>;
}

/**
 * Financial import review screen: batch detail, pipeline stepper, staging
 * rows with validation/duplicate/posting state, and the batch's open
 * issues. Posting is approval-gated — the control stays disabled until an
 * approval exists (no silent auto-posting).
 */
export default async function ImportReviewPage({ searchParams }: Props) {
  const params = await searchParams;
  const scope = await resolveScope(params);

  if (scope.kind === "unconfigured") {
    return (
      <>
        <PageHeading title="بازبینی ورود اطلاعات" subtitle="بررسی دسته پیش از انتشار مجوزدار" />
        <UnconfiguredState />
      </>
    );
  }
  if (scope.kind === "no_company" || scope.kind === "no_fiscal_years") {
    return (
      <>
        <PageHeading title="بازبینی ورود اطلاعات" />
        <EmptyState title="فضای کاری سال مالی آماده نیست" />
      </>
    );
  }
  if (scope.kind === "no_selection") {
    return (
      <>
        <PageHeading title="بازبینی ورود اطلاعات" subtitle="بررسی دسته پیش از انتشار مجوزدار" />
        <FiscalYearRequiredState />
      </>
    );
  }

  const fyLabel = toFaDigits(scope.fiscalYear.label);
  const batchesRes = await listImportBatches(scope.scope);

  if (!batchesRes.ok) {
    return (
      <>
        <PageHeading title={`بازبینی ورود اطلاعات ${fyLabel}`} />
        <UnconfiguredState />
      </>
    );
  }

  const batchId = params.batch;
  const batch = batchId ? batchesRes.data.find((b) => b.id === batchId) : undefined;

  if (!batchId || !batch) {
    return (
      <>
        <PageHeading
          title={`بازبینی ورود اطلاعات ${fyLabel}`}
          subtitle="یک دسته ورود را برای بازبینی انتخاب کنید"
        />
        {batchesRes.data.length === 0 ? (
          <EmptyState title="دسته‌ای برای بازبینی وجود ندارد">
            پس از ثبت فایل منبع در مانیتور ورود اطلاعات، دسته‌ها در اینجا فهرست می‌شوند.
          </EmptyState>
        ) : (
          <ul className="fz-stepper" aria-label="فهرست دسته‌های ورود">
            {batchesRes.data.map((b) => {
              const st = batchStatusBadge(b.status);
              return (
                <li key={b.id} className="fz-step">
                  <span className="fz-step-index" aria-hidden="true">•</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <Link href={`/imports/review?batch=${b.id}`}>
                      <span className="fz-table-id">{shortId(b.id)}</span>
                    </Link>
                    <span style={{ fontSize: "var(--fz-text-xs)", color: "var(--fz-text-secondary)" }}>
                      {stageLabel(b.stage)} — {displayDateTime(b.created_at)}
                    </span>
                    <span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const [stagingRes, issuesRes, fileRes] = await Promise.all([
    listStagingRecords(batch.id, { limit: 200 }),
    listValidationIssues({
      companyId: scope.scope.companyId,
      fiscalYearId: scope.scope.fiscalYearId,
    }),
    getBatchSourceFile(batch.source_file_id),
  ]);
  const batchIssues = issuesRes.ok
    ? issuesRes.data.filter((i) => i.import_batch_id === batch.id)
    : [];
  const staging = stagingRes.ok ? stagingRes.data : [];
  const statusBadge = batchStatusBadge(batch.status);
  const expected = batch.expected_totals as Record<string, unknown> | null;
  const summary = batch.reconciliation_summary as Record<string, unknown> | null;

  return (
    <>
      <PageHeading
        title={`بازبینی دسته ${shortId(batch.id)}`}
        subtitle={`سال مالی ${fyLabel} — نسخه ${batch.pipeline_version}`}
        actions={
          <Link href="/imports" className="fz-btn fz-btn-secondary">
            بازگشت به مانیتور
          </Link>
        }
      />

      <div className="fz-filter-row" role="status">
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        <Badge variant="neutral">مرحله: {stageLabel(batch.stage)}</Badge>
        {batch.error_summary ? (
          <Badge variant="danger">{batch.error_summary}</Badge>
        ) : null}
      </div>

      {!stagingRes.ok || !issuesRes.ok ? <UnconfiguredState /> : null}

      <section aria-label="خط لوله این دسته" className="fz-card">
        <h2 className="fz-card-title">مراحل خط لوله</h2>
        <ol className="fz-stepper" style={{ marginBlockStart: "var(--fz-space-3)" }}>
          {PIPELINE_STAGE_ORDER.map((stage, i) => {
            const state = stageProgressState(stage, batch.status, batch.stage);
            return (
              <li key={stage} className="fz-step" data-state={state}>
                <span className="fz-step-index" aria-hidden="true">
                  {toFaDigits(String(i + 1))}
                </span>
                <span className="fz-step-label">{stageLabel(stage)}</span>
                <span className="fz-table-hint" style={{ marginInlineStart: "auto" }}>
                  {state === "done"
                    ? "انجام‌شده"
                    : state === "current"
                      ? "در جریان"
                      : state === "failed"
                        ? "ناموفق"
                        : "در انتظار"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="fz-grid-2" aria-label="خلاصه دسته">
        <div className="fz-card">
          <h2 className="fz-card-title">فایل منبع</h2>
          <dl className="fz-dl" style={{ marginBlockStart: "var(--fz-space-3)" }}>
            <div>
              <dt>نام فایل</dt>
              <dd>{fileRes.ok && fileRes.data ? fileRes.data.original_filename : "—"}</dd>
            </div>
            <div>
              <dt>اثر انگشت SHA-256</dt>
              <dd>
                <span className="fz-table-id">
                  {fileRes.ok && fileRes.data ? fileRes.data.content_sha256 : "—"}
                </span>
              </dd>
            </div>
            <div>
              <dt>نسخه خام</dt>
              <dd>
                {fileRes.ok && fileRes.data
                  ? fileRes.data.raw_preserved
                    ? "نگهداری شده ✓"
                    : "هنوز نگهداری نشده"
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>زمان ایجاد دسته</dt>
              <dd className="fz-numeric">{displayDateTime(batch.created_at)}</dd>
            </div>
          </dl>
        </div>
        <div className="fz-card">
          <h2 className="fz-card-title">تطبیق</h2>
          <dl className="fz-dl" style={{ marginBlockStart: "var(--fz-space-3)" }}>
            <div>
              <dt>وضعیت تطبیق</dt>
              <dd>
                {summary
                  ? summary["status"] === "matched"
                    ? "هم‌خوان"
                    : summary["status"] === "mismatched"
                      ? "ناسازگار"
                      : "ناقص (منبع مجموع اعلام نکرده)"
                  : "انجام نشده"}
              </dd>
            </div>
            <div>
              <dt>انتظار منبع</dt>
              <dd>
                {expected
                  ? [
                      expected["rows"] !== undefined
                        ? `${toFaDigits(String(expected["rows"]))} ردیف`
                        : null,
                      expected["total_amount"] !== undefined && expected["currency"]
                        ? displayMoney(String(expected["total_amount"]), String(expected["currency"]))
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "اعلام نشده"
                  : "اعلام نشده"}
              </dd>
            </div>
            <div>
              <dt>تعداد رکورد مرحله‌بندی</dt>
              <dd className="fz-numeric">{toFaDigits(String(staging.length))}</dd>
            </div>
            <div>
              <dt>مهمان باز</dt>
              <dd className="fz-numeric">
                {toFaDigits(
                  String(batchIssues.filter((i) => i.severity === "error" && i.status === "open").length),
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <Alert tone="info" title="انتشار نیاز به تأیید دارد">
        دکمه انتشار زمانی فعال می‌شود که یک درخواست تأیید (post_import_batch) برای این دسته
        ثبت و تصویب شده باشد؛ انتشار خودکار یا بی‌مجوز هرگز انجام نمی‌شود. اجرای مجدد
        انتشار روی دسته منتشرشده، بدون ایجاد رکورد تکراری فقط «قبلاً منتشر شد» گزارش می‌کند.
      </Alert>

      <div className="fz-page-actions">
        <button type="button" className="fz-btn fz-btn-primary" aria-disabled="true" disabled>
          درخواست تأیید برای انتشار
        </button>
        <button type="button" className="fz-btn fz-btn-secondary" aria-disabled="true" disabled>
          انتشار مجوزدار
        </button>
        <span className="fz-table-hint">
          این کنترل‌ها پس از راه‌انجری جریان تأیید و ورود کاربر فعال می‌شوند (مرحله بعدی).
        </span>
      </div>

      <section aria-label="رکوردهای مرحله‌بندی">
        <div className="fz-table-toolbar">
          <h2>رکوردهای مرحله‌بندی</h2>
          <span className="fz-table-hint">
            رکوردهای مرحله‌بندی هیچ‌گاه سند مالی ثبت‌شده نیستند
          </span>
        </div>
        {staging.length === 0 ? (
          <EmptyState title="رکوردی در این دسته مرحله‌بندی نشده است" />
        ) : (
          <div
            className="fz-table-wrap"
            role="region"
            aria-label="جدول رکوردهای مرحله‌بندی — قابل پیمایش افقی"
            tabIndex={0}
          >
            <table className="fz-table">
              <caption>{toFaDigits(String(staging.length))} رکورد</caption>
              <thead>
                <tr>
                  <th scope="col">ردیف</th>
                  <th scope="col">نوع</th>
                  <th scope="col">تاریخ</th>
                  <th scope="col" className="fz-num-th">مبلغ</th>
                  <th scope="col">اعتبارسنجی</th>
                  <th scope="col">تکراری</th>
                  <th scope="col">وضعیت انتشار</th>
                </tr>
              </thead>
              <tbody>
                {staging.map((row) => {
                  const norm = row.normalized as Record<string, unknown>;
                  const vs = validationStatusBadge(row.validation_status);
                  const ds = duplicateStatusBadge(row.duplicate_status);
                  const ps = postStatusBadge(row.post_status);
                  return (
                    <tr key={row.id}>
                      <td className="fz-numeric">{toFaDigits(String(row.source_row_no))}</td>
                      <td>{recordKindLabel(row.record_kind)}</td>
                      <td className="fz-numeric">
                        {typeof norm["date"] === "string" ? displayDate(norm["date"] as string) : "—"}
                      </td>
                      <td className="fz-num">
                        {typeof norm["amount"] === "string" && norm["amount"] !== null
                          ? displayMoney(norm["amount"] as string, String(norm["currency"] ?? "IRR"))
                          : "—"}
                      </td>
                      <td>
                        <Badge variant={vs.variant}>{vs.label}</Badge>
                      </td>
                      <td>
                        <Badge variant={ds.variant}>{ds.label}</Badge>
                      </td>
                      <td>
                        <Badge variant={ps.variant}>{ps.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="استثناهای این دسته">
        <div className="fz-table-toolbar">
          <h2>استثناهای این دسته</h2>
          <Link href={`/validation?fy=${scope.fiscalYear.id}`} className="fz-btn fz-btn-secondary" style={{ minHeight: 36, fontSize: "var(--fz-text-sm)" }}>
            صف کامل اعتبارسنجی
          </Link>
        </div>
        {batchIssues.length === 0 ? (
          <EmptyState title="استثنایی برای این دسته ثبت نشده است" />
        ) : (
          <div className="fz-table-wrap" role="region" aria-label="جدول استثناهای دسته" tabIndex={0}>
            <table className="fz-table">
              <caption>{toFaDigits(String(batchIssues.length))} مورد</caption>
              <thead>
                <tr>
                  <th scope="col">شدت</th>
                  <th scope="col">کد</th>
                  <th scope="col">پیام</th>
                  <th scope="col">مرجع</th>
                </tr>
              </thead>
              <tbody>
                {batchIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <Badge
                        variant={
                          issue.severity === "error"
                            ? "danger"
                            : issue.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                      >
                        {issue.severity === "error" ? "خطا" : issue.severity === "warning" ? "هشدار" : "اطلاع"}
                      </Badge>
                    </td>
                    <td>
                      <span className="fz-table-id">{issue.code}</span>
                    </td>
                    <td>{issue.message_fa}</td>
                    <td>{issue.source_ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
