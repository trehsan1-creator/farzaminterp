# Accessibility Requirements

Target WCAG 2.2 AA as the implementation goal.

## Perceivable
- Maintain sufficient text and non-text contrast.
- Never use color as the only signal for status, errors, chart series, or selection.
- Provide text alternatives for meaningful images; mark decorative artwork as decorative.
- Support 200% browser zoom without loss of essential functionality.
- Do not place essential instructions only in images or tooltips.

## Operable
- All functionality is keyboard accessible.
- Provide visible focus using the shared focus token.
- Use semantic buttons, links, labels, tables, and headings.
- Menus and dialogs support predictable focus movement and restoration.
- Touch targets should be at least 44×44 CSS pixels where practical.
- Avoid hover-only interactions.

## Understandable
- Use consistent Persian terminology and interaction patterns.
- Label every form field.
- Explain errors in text and associate them programmatically with fields.
- Confirm destructive and irreversible actions.
- Keep navigation and behavior consistent.

## Robust
- Use valid semantic HTML and accessible names.
- Use ARIA only when native semantics are insufficient.
- Announce asynchronous status changes without flooding screen readers.
- Ensure RTL and mixed-direction content have a sensible reading order.

## Charts and financial data
Provide a concise text summary or accessible data alternative for charts. Tables need proper header associations. Positive/negative movement must not be conveyed by color alone; include signs, labels, or text alternatives.
