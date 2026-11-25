"use client";

/**
 * Responsive application shell (design-system/examples/APP_SHELL.md):
 * desktop persistent sidebar, mobile accessible drawer, top bar with
 * company context and explicit fiscal-year selector.
 */

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "./nav-items";
import { FiscalYearSelect } from "./FiscalYearSelect";

export interface ShellFiscalYear {
  id: string;
  label: string;
  status: string;
}

export interface ShellCompany {
  nameFa: string;
  baseCurrency: string;
}

interface AppShellProps {
  company: ShellCompany | null;
  fiscalYears: ShellFiscalYear[];
  dbConfigured: boolean;
  children: ReactNode;
}

export function AppShell({ company, fiscalYears, dbConfigured, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  // Navigation from the drawer closes it (no effect needed).
  const handleNavClick = useCallback(() => setDrawerOpen(false), []);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    },
    [closeDrawer],
  );

  return (
    <div className="fz-app-shell">
      <a href="#main-content" className="fz-btn fz-btn-secondary" style={{ position: "absolute", insetInlineStart: "-9999px" }}
        onFocus={(e) => { e.currentTarget.style.insetInlineStart = "8px"; e.currentTarget.style.zIndex = "60"; }}
        onBlur={(e) => { e.currentTarget.style.insetInlineStart = "-9999px"; }}
      >
        رفتن به محتوای اصلی
      </a>

      <button
        type="button"
        className="fz-backdrop"
        aria-label="بستن منو"
        hidden={!drawerOpen}
        onClick={closeDrawer}
        onKeyDown={onKeyDown}
      />

      <aside
        className="fz-sidebar"
        data-open={drawerOpen ? "true" : "false"}
        aria-label="ناوبری اصلی"
        onKeyDown={onKeyDown}
      >
        <div className="fz-sidebar-brand">
          {/* Official brand asset — never recreated or recolored. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/af-logo.svg" alt="لوگوی آتی فرزام" />
          <span className="fz-brand-text">فرزام ERP</span>
        </div>
        <nav className="fz-nav" aria-label="منوی برنامه">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="fz-nav-group-title" id={`nav-group-${group.title}`}>
                {group.title}
              </div>
              <ul className="fz-nav-list" aria-labelledby={`nav-group-${group.title}`}>
                {group.items.map((item) => {
                  const active = !group.disabled && pathname === item.href;
                  if (group.disabled) {
                    return (
                      <li key={item.label}>
                        <span
                          className="fz-nav-link"
                          aria-disabled="true"
                          title="این ماژول در مراحل بعدی اضافه می‌شود"
                        >
                          {item.label}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="fz-nav-link"
                        data-active={active ? "true" : "false"}
                        aria-current={active ? "page" : undefined}
                        onClick={handleNavClick}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="fz-sidebar-footer">
          نسخه پایه — مرحله ۰۰
          <br />
          دسترسی Muse از طریق API نسخه‌دار
        </div>
      </aside>

      <div className="fz-main">
        <header className="fz-topbar">
          <button
            type="button"
            className="fz-menu-btn"
            aria-label="باز کردن منو"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="fz-topbar-context">
            <span className="fz-topbar-company">{company?.nameFa ?? "آتی فرزام"}</span>
            <span className="fz-topbar-env">
              {dbConfigured ? "اتصال پایگاه داده برقرار" : "پایگاه داده پیکربندی نشده"}
            </span>
          </div>

          <div className="fz-topbar-spacer" />

          <FiscalYearSelect fiscalYears={fiscalYears} />
        </header>

        <main id="main-content" className="fz-page">
          {children}
        </main>
      </div>
    </div>
  );
}
