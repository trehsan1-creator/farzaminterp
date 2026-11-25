# Persian, RTL, and Locale Rules

Persian is the primary product language. RTL must be structural and consistent—not simulated by right-aligning text alone.

## Document direction
Set the application root to lang="fa" and dir="rtl". Use logical CSS properties such as margin-inline-start, padding-inline-end, inset-inline-start, and border-inline-start instead of left/right properties. Do not reverse content order blindly.

## Mixed-direction content
Account numbers, IBANs, invoice codes, URLs, email addresses, file paths, serial numbers, and Latin technical strings often need LTR isolation. Use dir="ltr" and unicode-bidi: isolate, or the bdi element. Do not switch an entire Persian sentence to LTR because it contains one code.

## Dates and fiscal years
- Display Jalali dates by default in Persian workflows.
- Use one shared date adapter/formatter; never hand-format dates independently.
- Keep storage/API date representation separate from display calendar.
- Distinguish document date, due date, posting date, and system timestamp.
- Fiscal-year selection must be explicit where figures depend on it.
- Never infer a record's accounting period solely from the current date.

## Digits
- Support Persian, Arabic-Indic, and Latin digit input where practical.
- Normalize digits at input boundaries before validation and persistence.
- Display digits consistently according to locale settings.
- Do not mutate stored identifiers merely to localize their visual representation.

## Currency and amounts
- Make the unit explicit (for example, تومان or ریال); never silently convert.
- Use locale-aware grouping and decimal formatting.
- Keep sign, amount, and currency unit visually unambiguous in RTL layouts.
- Preserve precision; formatting must not round unless a business rule requires it.
- Align amounts consistently and use tabular numerals.

## Validation, charts, and icons
- Use clear Persian validation messages adjacent to fields.
- Confirm destructive or irreversible financial actions explicitly.
- Charts may use RTL labels, but chronological axes must preserve chronological meaning.
- Directional icons should reflect interface direction. Non-directional icons should not be mirrored.
- Never mirror logos or brand artwork.
