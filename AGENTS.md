# Repository Instructions — Farzam ERP

This repository follows the Farzam ERP Design System as its mandatory UI and UX source of truth.

## Before changing or creating UI
1. Read `design-system/README.md`.
2. Read the relevant foundation documents under `design-system/`.
3. Read `design-system/tokens.css` and reuse its design tokens.
4. Inspect the current application stack and existing patterns before choosing implementation details. Do not assume a framework or replace existing architecture without approval.

## Non-negotiable requirements
- Every user-facing screen must be fully responsive and mobile-first, not merely desktop layouts squeezed onto small screens.
- Persian is the primary interface language. Use RTL at the document and layout level, while explicitly isolating LTR values such as IDs, codes, URLs, serial numbers, and Latin technical strings.
- Use the supplied Peyda font family and official Farzam brand assets where available. Do not redraw, recolor, distort, or replace the logo.
- Reuse semantic color, spacing, typography, radius, border, elevation, and state tokens. Do not introduce arbitrary one-off values when a token exists.
- Build reusable components and consistent interaction patterns. Do not duplicate page-specific controls.
- Financial amounts, dates, statuses, and tables must follow `design-system/RTL_AND_LOCALE.md` and `design-system/COMPONENTS.md`.
- All tables, filters, forms, dialogs, navigation, charts, and PIP/AI surfaces must follow the responsive rules in `design-system/RESPONSIVE.md`.
- Meet the accessibility requirements in `design-system/ACCESSIBILITY.md`; never communicate status through color alone.
- Preserve backend contracts, database semantics, permissions, and business rules. A visual task is not permission to change them.

## Responsive verification
Before marking a UI task complete, verify at minimum:
- 320px and 375px mobile widths
- 768px tablet width
- 1024px compact desktop width
- 1440px desktop width

Check for horizontal page overflow, clipped controls, unreadable tables, inaccessible menus, overlapping dialogs, and broken RTL/LTR mixed content. Horizontal scrolling is permitted only inside deliberately designed data/table containers, never as accidental page overflow.

## Completion checklist
- Responsive behavior has been checked at the widths above.
- Loading, empty, error, success, disabled, and permission-denied states are handled where relevant.
- Keyboard focus and accessible names are present.
- No unapproved brand colors, fonts, or visual patterns were introduced.
- Relevant design-system documentation is updated when a reusable pattern or token changes.

The authoritative design specification is in `design-system/`. If an implementation request conflicts with it, explain the conflict and ask for clarification rather than silently inventing a new visual language.
