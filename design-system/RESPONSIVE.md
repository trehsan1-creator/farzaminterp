# Responsive Design Specification

Responsive behavior is mandatory for every screen and component. The product is desktop-first in work density, but implementation must be mobile-first and fully usable on touch devices.

## Verification widths
| Range | Expected behavior |
|---|---|
| 320–359px | Single column, compact controls, no page-level horizontal overflow |
| 360–599px | Single column; stacked filters and cards |
| 600–767px | Two-column cards only when content remains readable |
| 768–1023px | Collapsible navigation; adaptive two-column content |
| 1024–1279px | Sidebar may collapse; dense content uses available width |
| 1280–1535px | Full navigation and multi-column workspaces |
| 1536px+ | Center content to a readable max width; avoid overly long text lines |

Prefer CSS grid minmax, flex wrapping, intrinsic sizing, and container queries where supported. Do not hard-code every component to a breakpoint.

## Application shell
- Desktop: persistent sidebar (about 256px), top bar, fluid main column.
- Tablet: sidebar collapses to icon rail or dismissible drawer.
- Mobile: accessible menu/drawer or a suitable compact navigation pattern; compact top bar with page title and contextual action.
- Navigation must never be hover-only. Respect mobile safe-area insets.

## Dashboards and charts
- Wide desktop: 3–4 KPI cards per row where content fits.
- Tablet: usually 2 cards per row.
- Mobile: 1 or 2 cards depending on minimum readable width; stack when values collide.
- Charts resize with their container and retain readable axes, legends, and tooltips. Simplify labels on mobile or provide a labelled scrollable chart viewport.

## Tables
- Desktop: semantic tables with headers, sorting, filters, and pagination.
- Tablet: hide only secondary columns when their values remain accessible in row details.
- Mobile: use purpose-designed cards or an explicitly labelled horizontal scroll region. Never squeeze many columns into unreadable text.
- Keep record identity, primary amount, date, and status visible.
- Row actions must work without hover.
- Horizontal scrolling may exist inside a deliberate table container, never as accidental page overflow.

## Forms, dialogs, and menus
- Desktop forms may use two columns for related short fields.
- Mobile forms are single-column, full-width, with labels above fields.
- Validation appears adjacent to its field.
- Complex mobile dialogs may become near-full-screen sheets.
- Menus fit within the viewport and support keyboard and touch.
- Escape closes non-destructive dialogs; focus returns to the invoking control.

## PIP / AI workspace
Activity feeds and review queues collapse to one column on mobile. Agent status is textual as well as visual. Human approval actions remain prominent and reachable. Do not autoplay animations or expand verbose traces by default on small screens.

## QA checklist
- [ ] 320px, 375px, 768px, 1024px, and 1440px verified.
- [ ] No accidental horizontal overflow.
- [ ] Navigation works by keyboard and touch.
- [ ] Tables expose all critical fields.
- [ ] Dialogs and popovers fit the viewport.
- [ ] Long Persian and Latin strings wrap or isolate correctly.
- [ ] 200% zoom preserves essential functionality.
