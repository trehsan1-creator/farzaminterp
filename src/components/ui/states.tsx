/**
 * Shared state components: every screen handles loading/empty/error/
 * permission/setup states (design-system implementation contract).
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
      <div>
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
  return <span className={`fz-badge fz-badge-${variant}`}>{children}</span>;
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
    <div className={`fz-alert fz-alert-${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="fz-alert-title">{title}</span>
      {children ? <span>{children}</span> : null}
    </div>
  );
}

/**
 * Database-not-configured state: honest setup guidance instead of
 * fabricated data (Stage 00 has no live Supabase project attached).
 */
export function UnconfiguredState() {
  return (
    <Alert tone="warning" title="پایگاه داده پیکربندی نشده است">
      برای نمایش داده‌های واقعی، مقادیر <code>NEXT_PUBLIC_SUPABASE_URL</code> و{" "}
      <code>SUPABASE_SERVICE_ROLE_KEY</code> را در فایل <code>.env.local</code> ثبت کنید و
      مهاجرت‌های <code>supabase/migrations</code> را اعمال کنید. تا آن زمان هیچ داده‌ای
      ساخته یا نمایش داده نمی‌شود.
    </Alert>
  );
}

/** Explicit fiscal-year selection required (never inferred from today). */
export function FiscalYearRequiredState() {
  return (
    <Alert tone="info" title="انتخاب سال مالی الزامی است">
      برای نمایش اسناد و ارقام، از نوار بالای صفحه یک سال مالی انتخاب کنید. سامانه هرگز
      سال مالی را از تاریخ فعلی استخراج نمی‌کند.
    </Alert>
  );
}

export function LoadingState() {
  return (
    <div className="fz-empty" role="status" aria-live="polite">
      <span className="fz-empty-title">در حال بارگذاری…</span>
    </div>
  );
}
