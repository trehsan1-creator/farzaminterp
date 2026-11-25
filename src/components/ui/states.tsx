/**
 * Shared state components: loading, empty, setup and alert states.
 * Status is always conveyed with text — never color alone.
 */

import type { ReactNode } from "react";

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="fz-page-heading">
      <div className="fz-page-heading-copy">
        <h1>{title}</h1>
        {subtitle ? <p className="fz-page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="fz-page-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  variant,
  children,
}: {
  variant: "success" | "warning" | "danger" | "info" | "neutral";
  children: ReactNode;
}) {
  return <span className={"fz-badge fz-badge-" + variant}>{children}</span>;
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="fz-empty" role="status">
      <span className="fz-empty-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" />
          <path d="M14 3.5V8h4M9 13h6M9 16h4" />
        </svg>
      </span>
      <span className="fz-empty-title">{title}</span>
      {children ? <p className="fz-empty-text">{children}</p> : null}
    </div>
  );
}

export function Alert({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={"fz-alert fz-alert-" + tone} role={tone === "danger" ? "alert" : "status"}>
      <span className="fz-alert-title">{title}</span>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

/** Connection/query state: keep guidance accurate for local and hosted runs. */
export function UnconfiguredState() {
  return (
    <Alert tone="warning" title="دریافت اطلاعات از پایگاه داده ممکن نیست">
      برنامه نتوانست داده‌های موردنیاز را دریافت کند. تنظیمات اتصال و دسترسی پایگاه داده را بررسی کنید؛ در محیط محلی فایل <code>.env.local</code> و در Vercel متغیرهای محیطی Production باید تنظیم باشند. پس از اصلاح تنظیمات، یک بار برنامه را دوباره اجرا یا Deploy کنید.
    </Alert>
  );
}

/** Explicit fiscal-year selection required (never inferred from today). */
export function FiscalYearRequiredState() {
  return (
    <Alert tone="info" title="انتخاب سال مالی الزامی است">
      برای نمایش اسناد و ارقام، از نوار بالای صفحه یک سال مالی انتخاب کنید. سامانه هرگز سال مالی را از تاریخ فعلی استخراج نمی‌کند.
    </Alert>
  );
}

export function LoadingState() {
  return (
    <div className="fz-empty" role="status" aria-live="polite">
      <span className="fz-empty-icon" aria-hidden="true">…</span>
      <span className="fz-empty-title">در حال بارگذاری اطلاعات</span>
    </div>
  );
}
