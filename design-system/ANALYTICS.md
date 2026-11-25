# Analytics and Charting Standard

## Purpose
The Stage 00 dashboard visualizes the state of persisted documents and import workflows for the explicitly selected fiscal year. Charts are not decorative placeholders and must never imply financial results that the accounting ledger has not established.

## Current chart set
- Monthly document activity: count of dated documents grouped by Jalali month.
- Document composition: persisted document count grouped by document type.
- Import pipeline health: persisted import batches grouped by their exact status.

## Data rules
- Every query must remain scoped by company and selected fiscal year.
- Chart series must be computed from persisted rows returned by the data layer.
- Missing dates are excluded from the monthly series and must not be assigned to an invented month.
- If the query is capped, the chart must disclose that it is based on the latest returned records.
- Empty datasets render an explicit empty state, never fabricated sample bars or percentages.
- Synthetic demo rows must remain visibly labelled as demo data.
- The current operational charts are not revenue, expense, profit, cash-flow, balance-sheet, or account-balance reports.
- Financial statements may only be added after validated journal entries and ledger aggregation are available.

## Visual rules
- Use the official Farzam palette and Peyda typography.
- Prefer SVG for small, dependency-free charts in the initial MVP.
- Provide accessible names and a textual legend or equivalent values.
- Keep charts responsive; use controlled horizontal scrolling only for dense time-series labels.
- Do not use 3D, perspective, gradients that obscure values, or color as the only status indicator.
- Show the fiscal-year context near the charts.
