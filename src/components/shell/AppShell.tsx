"use client";

/**
 * Responsive enterprise shell:
 * - Persistent RTL sidebar on wide screens.
 * - Accessible drawer on mobile and tablet.
 * - Company, connection and fiscal-year context in the top bar.
 */

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { NAV_GROUPS, type NavItem } from "./nav-items";
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

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "documents":
      return <svg {...common}><path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5Z" /><path d="M14 3.5V8h4M9 12h6M9 16h6" /></svg>;
    case "imports":
      return <svg {...common}><path d="M12 15V3m0 0L8 7m4-4 4 4" /><path d="M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13" /></svg>;
    case "review":
      return <svg {...common}><path d="M8 4.5h8M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1Z" /><rect x="5" y="5.5" width="14" height="16" rx="2" /><path d="m9 14 2 2 4-4" /></svg>;
    case "validation":
      return <svg {...common}><path d="M12 3 20 6v5.5c0 4.8-3.4 7.8-8 9.5-4.6-1.7-8-4.7-8-9.5V6l8-3Z" /><path d="M12 8v4m0 3h.01" /></svg>;
    case "ledger":
      return <svg {...common}><path d="M5 4h14v17H5zM8 8h8M8 12h8M8 16h5" /></svg>;
    case "treasury":
      return <svg {...common}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4M16 3v3" /></svg>;
    case "commerce":
      return <svg {...common}><path d="M4 5h2l2 11h10l2-8H7" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg>;
    case "assets":
      return <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></svg>;
    case "people":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 4.4" /></svg>;
    case "tax":
      return <svg {...common}><path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h6M9 16h6" /><path d="m9 8 1 1 2-2" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

export function AppShell({ company, fiscalYears, dbConfigured, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedFiscalYear = searchParams.get("fy");

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const handleNavClick = useCallback(() => setDrawerOpen(false), []);
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    },
    [closeDrawer],
  );

  const currencyLabel = company?.baseCurrency === "IRR" ? "ریال" : company?.baseCurrency === "IRT" ? "تومان" : "واحد پول نامشخص";

  return (
    <div className="fz-app-shell">
      <a href="#main-content" className="fz-skip-link">
        رفتن به محتوای اصلی
      </a>

      <button
        type="button"
        className="fz-backdrop"
        aria-label="بستن منوی اصلی"
        hidden={!drawerOpen}
        onClick={closeDrawer}
      />

      <aside
        id="app-navigation"
        className="fz-sidebar"
        data-open={drawerOpen ? "true" : "false"}
        aria-label="ناوبری اصلی"
        onKeyDown={onKeyDown}
      >
        <div className="fz-sidebar-brand">
          <div className="fz-sidebar-brand-lockup" aria-label="آتی فرزام">
            <Image
              src="/brand/af-logo.svg"
              alt=""
              width={36}
              height={36}
              className="fz-brand-symbol"
              priority
            />
            <Image
              src="/brand/wordmark-fa.svg"
              alt="آتی فرزام"
              width={116}
              height={39}
              className="fz-brand-wordmark"
              priority
            />
          </div>
          <span className="fz-brand-caption">سامانه یکپارچه مالی · ERP</span>
        </div>

        <nav className="fz-nav" aria-label="منوی برنامه">
          {NAV_GROUPS.map((group) => (
            <section className="fz-nav-group" key={group.title}>
              <h2 className="fz-nav-group-title">{group.title}</h2>
              <ul className="fz-nav-list">
                {group.items.map((item) => {
                  const active = !group.disabled && pathname === item.href;
                  const href = selectedFiscalYear
                    ? item.href + (item.href.includes("?") ? "&" : "?") + "fy=" + encodeURIComponent(selectedFiscalYear)
                    : item.href;
                  if (group.disabled) {
                    return (
                      <li key={item.href}>
                        <span className="fz-nav-link fz-nav-link-disabled" aria-disabled="true">
                          <NavIcon name={item.icon} />
                          <span className="fz-nav-label">{item.label}</span>
                          <span className="fz-nav-soon">به‌زودی</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={href}
                        className="fz-nav-link"
                        data-active={active ? "true" : "false"}
                        aria-current={active ? "page" : undefined}
                        onClick={handleNavClick}
                      >
                        <NavIcon name={item.icon} />
                        <span className="fz-nav-label">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>

        <div className="fz-sidebar-footer">
          <span className="fz-sidebar-footer-mark" aria-hidden="true">●</span>
          <div>
            <strong>آماده توسعه با PIP</strong>
            <span>درگاه یکپارچه‌سازی نسخه‌دار</span>
          </div>
          <span className="fz-sidebar-version">مرحله ۰۰</span>
        </div>
      </aside>

      <div className="fz-main">
        <header className="fz-topbar">
          <button
            type="button"
            className="fz-menu-btn"
            aria-label={drawerOpen ? "بستن منو" : "باز کردن منو"}
            aria-controls="app-navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((value) => !value)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              {drawerOpen
                ? <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                : <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
          </button>

          <div className="fz-topbar-context">
            <span className="fz-topbar-overline">فضای کاری شرکت</span>
            <strong className="fz-topbar-company">{company?.nameFa ?? "آتی فرزام"}</strong>
            <span className="fz-topbar-env">
              <span className={"fz-connection-dot" + (dbConfigured ? " is-connected" : "")} aria-hidden="true" />
              {dbConfigured ? "اتصال پایگاه داده برقرار · واحد پایه " + currencyLabel : "اتصال پایگاه داده برقرار نیست"}
            </span>
          </div>

          <div className="fz-topbar-spacer" />

          <div className="fz-topbar-year">
            <span className="fz-topbar-overline">دوره گزارش‌گیری</span>
            <FiscalYearSelect fiscalYears={fiscalYears} />
          </div>
        </header>

        <main id="main-content" className="fz-page">
          {children}
        </main>
      </div>
    </div>
  );
}
