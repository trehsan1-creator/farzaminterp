# Responsive App Shell — Reference Pattern

Framework-neutral structure. Adapt it to the current app; do not copy it as a standalone application.

    <div class="app-shell" dir="rtl">
      <aside class="app-sidebar" aria-label="ناوبری اصلی">
        <!-- Brand and labelled navigation groups -->
      </aside>
      <div class="app-main">
        <header class="app-topbar">
          <!-- Page context, fiscal year, notifications, profile -->
        </header>
        <main id="main-content" class="page-content">
          <div class="page-heading">
            <div>
              <h1>داشبورد مالی</h1>
              <p>نمای کلی عملکرد مالی در سال مالی انتخاب‌شده</p>
            </div>
            <div class="page-actions"><!-- Primary action --></div>
          </div>
          <section class="kpi-grid" aria-label="شاخص‌های مالی">
            <!-- Shared KPI components -->
          </section>
          <section class="dashboard-grid">
            <!-- Charts, review queue, recent transactions -->
          </section>
        </main>
      </div>
    </div>

## Expectations
Use a fluid main column. At mobile widths, navigation becomes a drawer or another purpose-designed compact pattern. Main content never causes viewport-level horizontal overflow. Interactive navigation has accessible names and active-state semantics. Fiscal-year context is visible wherever displayed figures depend on it.
