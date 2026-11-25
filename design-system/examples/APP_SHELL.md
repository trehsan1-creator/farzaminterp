# Responsive App Shell — Reference Pattern

Framework-neutral structure. Adapt it to the current app; do not copy it as a standalone application.

    <div class="app-shell" dir="rtl">
      <aside class="app-sidebar" aria-label="ناوبری اصلی">
        <!-- Official brand mark and labelled navigation groups -->
      </aside>
      <div class="app-main">
        <header class="app-topbar">
          <!-- Company context, connection state and fiscal-year selector -->
        </header>
        <main id="main-content" class="page-content">
          <div class="page-heading">
            <div>
              <h1>داشبورد مالی</h1>
              <p>نمای کلی عملکرد مالی در سال مالی انتخاب‌شده</p>
            </div>
            <div class="page-actions"><!-- One primary action --></div>
          </div>
          <section class="kpi-grid" aria-label="شاخص‌های عملیاتی">
            <!-- KPI cards with truthful labels, units and fiscal period -->
          </section>
          <section class="dashboard-grid">
            <!-- Recent documents, import state, data quality and quick actions -->
          </section>
        </main>
      </div>
    </div>

## Expectations
Use a fluid main column. At 1024px and above, show the persistent RTL sidebar. Between 768px and 1023px, use a dismissible drawer. Below 768px, use a compact top bar and accessible drawer. Main content never causes viewport-level horizontal overflow. Interactive navigation has accessible names and active-state semantics. Preserve the selected fiscal-year query parameter when navigating between modules. Fiscal-year context is visible wherever displayed figures depend on it.
