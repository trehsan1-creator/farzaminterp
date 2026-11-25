# Farzam ERP Design System
Version 1.0.0 — Initial implementation specification

This directory is the single source of truth for Farzam ERP visual language and UI behavior. Read it before implementing any user-facing interface.

## Product principles
1. Financial clarity first: prioritize legibility, hierarchy, traceability, and low cognitive load.
2. Responsive by default: design from narrow mobile screens upward; mobile is not a compressed desktop.
3. Persian-first and RTL-native: mixed Persian/Latin content must remain directionally correct.
4. Consistent, not generic: preserve Ati Farzam navy identity; use blue and orange as disciplined accents.
5. Data-dense, not crowded: predictable tables, readable values, and clear drill-down paths.
6. Human-governed intelligence: PIP/AI activity must be explainable, reviewable, permission-aware, and visually subordinate to authoritative financial data.

## Brand foundation
- Primary brand navy: #102333, sampled from supplied official SVG assets.
- Electric blue: #4472F6, present in the supplied isometric illustration.
- Signal orange: #FF3F1F, present in the supplied isometric illustration.
- Primary typeface: Peyda, supplied in Regular, Medium, SemiBold, Bold, and ExtraBold.
- Official logo and wordmarks must not be recreated, distorted, or arbitrarily recolored.
- The supplied isometric illustration is decorative; use sparingly on onboarding or empty states, never behind financial data.

## Files
- tokens.css — canonical CSS custom properties.
- TOKENS.md — token intent and usage.
- TYPOGRAPHY.md — Peyda family, type scale, and number treatment.
- RESPONSIVE.md — breakpoints, navigation, tables, dialogs, and responsive rules.
- RTL_AND_LOCALE.md — Persian RTL, Jalali dates, digits, currency, and mixed-direction content.
- COMPONENTS.md — component behavior and interaction contracts.
- ACCESSIBILITY.md — accessibility requirements.
- ASSET_MANIFEST.md — official brand assets and integration paths.
- examples/ — reference patterns.

## Visual direction
Default theme: Light Enterprise. Use a very light cool-neutral canvas, white content surfaces, deep navy for brand and high-level navigation, electric blue for primary actions and active states, and orange only for selective attention. Use restrained borders and subtle elevation.

Dark mode may be added as a separately validated theme. It is not the default and must not become a second unrelated visual language.

## Implementation contract
- Treat tokens.css as the source of truth. Framework tokens may alias it but must not create parallel palettes.
- Reuse shared components for navigation, forms, tables, filters, statuses, dates, money, dialogs, and AI activity.
- Use the existing application stack. This specification does not mandate a framework.
- Do not replace architecture, APIs, database contracts, or business rules to implement styling.
- Every page must handle loading, empty, error, disabled, and permission-denied states where relevant.
- Financial facts must remain traceable to their source records.
- Update this directory when a shared token or component contract changes.

## Responsive acceptance widths
Verify 320, 375, 768, 1024, and 1440 CSS pixels. No accidental page-level horizontal overflow is allowed.

## Asset note
The supplied archive contains five Peyda WOFF2 files and four SVG assets. SVG files are tracked under assets/brand/. Font files belong under assets/fonts/. See ASSET_MANIFEST.md. If binary fonts are not yet present in the repository, do not silently substitute another font; use a temporary system fallback and flag the missing assets.
