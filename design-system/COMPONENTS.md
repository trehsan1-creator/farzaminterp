# Component Contracts

This document defines behavior, not a framework mandate. Implement with the existing stack and shared component conventions.

## Application shell
Sidebar navigation has labelled groups, active state, collapsed and mobile variants, and keyboard support. Top bar provides page context, fiscal-year context where relevant, notifications, and user menu. Breadcrumbs do not replace page title.

## Buttons
Variants: primary, secondary, tertiary/ghost, destructive, and link. Use one visually dominant primary action per region. Distinguish disabled, loading, pressed, and focus states. Prevent duplicate submissions. Confirm irreversible destructive actions.

## Forms
Use persistent visible labels, helper/error text, and required/optional distinction. Preserve user input on recoverable errors. Use fieldsets for related groups. Date, money, account, and tax fields should use shared domain-aware controls.

## Financial amount input
Accept localized digits and normalize before validation. Show currency unit explicitly. Support negative values only where domain permits. Delegate arithmetic and precision to domain-safe logic. Never silently round or convert Rial/Toman.

## Date picker
Jalali display by default in Persian locale. Use shared calendar adapter, accessible keyboard interactions, clear today/selected states, and business-rule min/max dates.

## Data tables
Use semantic headers and row associations. Sorting, filters, pagination, and selection expose current state. Amount/date/status use shared formatters. Row actions have accessible names. Empty, loading, error, and no-results states are distinct. Follow RESPONSIVE.md.

## KPI cards and charts
Each KPI has a label, value, unit, period, and optional comparison context. Charts include labels, accessible summaries, and non-color distinctions. Tooltips must work on touch, not hover only.

## Status badges
Use semantic success, warning, danger, info, and neutral states. Pair color with text or accessible icon. Do not create a new color for every module.

## Dialogs and notifications
Dialogs trap focus and restore it when closed. Drawers serve navigation or contextual workflows. Notifications are concise and actionable; critical financial errors must not exist only in transient toasts.

## PIP / AI components
- Agent status: agent/task name, textual state, last update, safe next action.
- Document review: source document, extracted facts, uncertainty where supported, review state.
- AI finding: finding, evidence/source reference, impact, suggested action.
- Approval request: exact action, affected records, approver.
- Activity timeline: timestamp, actor/agent, action, outcome, evidence link.
AI suggestions must be distinguished from posted/approved accounting facts. Never imply an agent action succeeded until the system confirms it.

## Required states
Consider initial/loading, populated, empty, no-results, recoverable error, permission denied, disabled/not applicable, success, and stale/out-of-date states where relevant.
