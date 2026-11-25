# UI Refinement 01 — Enterprise RTL Workspace

## Objective
Improve the Stage 00 Farzam ERP interface so the current financial foundation is easier to navigate and review on desktop, tablet and mobile. This pass is UI/UX-only: it does not change database schema, financial calculations, import behavior, posting rules, or API contracts.

## Implemented
- Fixed the RTL sidebar breakpoint issue that kept desktop navigation translated off-screen.
- Added a persistent desktop sidebar and a dismissible mobile/tablet drawer.
- Added labelled navigation icons, active states, future-module labels and connection context.
- Preserved the selected fiscal-year query parameter when navigating between modules.
- Reworked the FY dashboard around truthful operational KPIs, recent persisted documents, processing status and quick links.
- Added explicit demo-data markers wherever the synthetic FY1404 records are surfaced.
- Refined the document register, import monitor, validation queue and import-review layout.
- Improved shared page headings, empty states and database connection guidance.
- Updated responsive, component and shell guidance in the design system.

## Financial integrity
- Dashboard KPIs remain operational counts. No revenue, profit, cash balance, receivables, payables or opening balances are inferred from unposted documents.
- The current DEMO-prefixed records remain labelled as synthetic preview data.
- No database writes, schema changes, journal postings or import executions are part of this UI pass.

## Verification
- Repository asset inventory confirms the official logo and five original Peyda WOFF2 font files are present.
- Static source review completed for the modified shell, dashboard and operational screens.
- Responsive behavior is specified for 320, 375, 768, 1024 and 1440 CSS-pixel widths.
- A hosted preview build and visual browser QA are still required before merging. No local test/build result is claimed in this report.

## Files in scope
- src/components/shell/AppShell.tsx
- src/components/shell/nav-items.ts
- src/app/globals.css
- src/app/(app)/page.tsx
- src/app/(app)/documents/page.tsx
- src/app/(app)/imports/page.tsx
- src/app/(app)/imports/review/page.tsx
- src/app/(app)/validation/page.tsx
- src/components/ui/states.tsx
- design-system/RESPONSIVE.md
- design-system/COMPONENTS.md
- design-system/examples/APP_SHELL.md
