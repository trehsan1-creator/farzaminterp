# Financial Table — Reference Pattern

A financial table prioritizes record identity, period, amount, status, and traceability.

## Suggested desktop columns
1. Document number
2. Document date
3. Description / counterparty
4. Account or category
5. Debit
6. Credit
7. Status
8. Row actions

## Mobile behavior
Do not shrink all columns until unreadable. Use either a purpose-built transaction card (document number, date, description, amount, status) or a labelled horizontal scroll region with clear affordance and an accessible way to inspect the complete row.

## Rules
- Use semantic table markup on desktop.
- Keep numeric columns consistently aligned and tabular.
- Format currency and date through shared locale formatters.
- Never hide primary amount or record identity.
- Keep actions keyboard and touch accessible.
- Provide distinct loading, empty, no-results, and error states.
- Clicking a row must not be the only way to access details; provide an explicit accessible action.
