-- ============================================================================
-- DEMO PREVIEW DATA — FY 1404 / Ati Farzam
--
-- This is synthetic UI-preview data only. It is NOT company accounting data.
-- Every row is explicitly marked with DEMO / «نمونه آزمایشی».
-- All financial documents remain registered (not posted).
-- No import batches, source files, validation issues, journal entries,
-- opening balances, or posted transactions are fabricated.
--
-- Safe to run repeatedly: deterministic IDs + unique demo codes.
-- Cleanup: delete documents/counterparties/bank_accounts/chart_of_accounts
-- whose document_no/code starts with DEMO- (or whose description/name/label
-- contains «نمونه آزمایشی»), after removing any dependent demo references.
-- ============================================================================

begin;

-- 1) Company-level counterparties (synthetic identities; no real contact data).
insert into public.counterparties
  (id, company_id, code, name_fa, name_en, kind, notes, status)
values
  ('d0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'DEMO-CUST-001', 'نمونه آزمایشی — شرکت آریا تجهیز', 'DEMO — Arya Tajhiz', 'customer', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active'),
  ('d0000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'DEMO-CUST-002', 'نمونه آزمایشی — گروه پارس تجارت', 'DEMO — Pars Tejarat', 'customer', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active'),
  ('d0000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'DEMO-CUST-003', 'نمونه آزمایشی — داده‌پردازان سپهر', 'DEMO — Dadeh Pardazan', 'customer', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active'),
  ('d0000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'DEMO-SUP-001', 'نمونه آزمایشی — تأمین کالای نوین', 'DEMO — Novin Supply', 'supplier', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active'),
  ('d0000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'DEMO-SUP-002', 'نمونه آزمایشی — فن‌آوران شرق', 'DEMO — Fanavaran Shargh', 'supplier', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active'),
  ('d0000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'DEMO-SUP-003', 'نمونه آزمایشی — بازرگانی سپهر', 'DEMO — Tejarat Sepehr', 'supplier', 'DEMO DATA ONLY — synthetic preview record; not a real counterparty.', 'active')
on conflict do nothing;

-- 2) Bank account master-data examples. No real account number or IBAN.
insert into public.bank_accounts
  (id, company_id, label, bank_name, branch_name, account_no, iban, currency, status)
values
  ('d1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'حساب آزمایشی جاری ۱', 'بانک ملت — نمونه نمایشی', 'شعبه آزمایشی', 'DEMO-ACCOUNT-001', null, 'IRR', 'active'),
  ('d1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'حساب آزمایشی جاری ۲', 'بانک سامان — نمونه نمایشی', 'شعبه آزمایشی', 'DEMO-ACCOUNT-002', null, 'IRR', 'active')
on conflict do nothing;

-- 3) FY1404 chart-of-accounts preview. All codes start with DEMO-.
-- Root accounts.
insert into public.chart_of_accounts
  (id, company_id, fiscal_year_id, code, parent_id, name_fa, name_en, account_type, normal_balance, is_postable, status)
values
  ('d2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1000', null, 'نمونه آزمایشی — دارایی‌ها', 'DEMO — Assets', 'asset', 'debit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-2000', null, 'نمونه آزمایشی — بدهی‌ها', 'DEMO — Liabilities', 'liability', 'credit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-3000', null, 'نمونه آزمایشی — حقوق مالکانه', 'DEMO — Equity', 'equity', 'credit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-4000', null, 'نمونه آزمایشی — درآمدها', 'DEMO — Revenue', 'revenue', 'credit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-5000', null, 'نمونه آزمایشی — هزینه‌ها', 'DEMO — Expenses', 'expense', 'debit', false, 'active')
on conflict do nothing;

-- Group and leaf accounts.
insert into public.chart_of_accounts
  (id, company_id, fiscal_year_id, code, parent_id, name_fa, name_en, account_type, normal_balance, is_postable, status)
values
  ('d2000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1100', 'd2000000-0000-4000-8000-000000000001', 'نمونه آزمایشی — دارایی‌های جاری', 'DEMO — Current Assets', 'asset', 'debit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1200', 'd2000000-0000-4000-8000-000000000001', 'نمونه آزمایشی — دارایی‌های غیرجاری', 'DEMO — Non-current Assets', 'asset', 'debit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-2100', 'd2000000-0000-4000-8000-000000000002', 'نمونه آزمایشی — بدهی‌های جاری', 'DEMO — Current Liabilities', 'liability', 'credit', false, 'active'),
  ('d2000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-3100', 'd2000000-0000-4000-8000-000000000003', 'نمونه آزمایشی — سرمایه', 'DEMO — Capital', 'equity', 'credit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-4100', 'd2000000-0000-4000-8000-000000000004', 'نمونه آزمایشی — درآمد فروش و خدمات', 'DEMO — Sales and Services Revenue', 'revenue', 'credit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-5100', 'd2000000-0000-4000-8000-000000000005', 'نمونه آزمایشی — هزینه‌های اداری', 'DEMO — Administrative Expenses', 'expense', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-5200', 'd2000000-0000-4000-8000-000000000005', 'نمونه آزمایشی — هزینه‌های عملیاتی', 'DEMO — Operating Expenses', 'expense', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1110', 'd2000000-0000-4000-8000-000000000006', 'نمونه آزمایشی — صندوق و تنخواه', 'DEMO — Cash on Hand', 'asset', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000014', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1120', 'd2000000-0000-4000-8000-000000000006', 'نمونه آزمایشی — موجودی بانک‌ها', 'DEMO — Bank Accounts', 'asset', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000015', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1130', 'd2000000-0000-4000-8000-000000000006', 'نمونه آزمایشی — حساب‌های دریافتنی', 'DEMO — Accounts Receivable', 'asset', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000016', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-1210', 'd2000000-0000-4000-8000-000000000007', 'نمونه آزمایشی — اموال و تجهیزات', 'DEMO — Property and Equipment', 'asset', 'debit', true, 'active'),
  ('d2000000-0000-4000-8000-000000000017', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'DEMO-2110', 'd2000000-0000-4000-8000-000000000008', 'نمونه آزمایشی — حساب‌های پرداختنی', 'DEMO — Accounts Payable', 'liability', 'credit', true, 'active')
on conflict do nothing;

-- 4) FY1404 document register preview. Amounts are illustrative IRR only.
-- Status stays 'registered'; nothing is posted to the ledger.
insert into public.documents
  (id, company_id, fiscal_year_id, document_type, document_no, document_date,
   counterparty_id, description, currency, amount_total, status, source)
values
  ('d3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'sales_invoice', 'DEMO-1404-001', date '2025-04-10', 'd0000000-0000-4000-8000-000000000001', 'نمونه آزمایشی — فاکتور فروش خدمات؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 2850000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'purchase_invoice', 'DEMO-1404-002', date '2025-05-05', 'd0000000-0000-4000-8000-000000000004', 'نمونه آزمایشی — فاکتور خرید تجهیزات؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 1420000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'bank_transaction', 'DEMO-1404-003', date '2025-06-10', 'd0000000-0000-4000-8000-000000000002', 'نمونه آزمایشی — گردش بانکی ورودی؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 750000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'journal', 'DEMO-1404-004', date '2025-07-03', null, 'نمونه آزمایشی — سند حسابداری نمایشی؛ هیچ ثبت دفتری ایجاد نشده است', 'IRR', 1200000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'tax_return', 'DEMO-1404-005', date '2025-09-09', null, 'نمونه آزمایشی — پرونده مالیاتی نمایشی؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 620000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'fixed_asset', 'DEMO-1404-006', date '2025-10-04', null, 'نمونه آزمایشی — شناسایی دارایی ثابت نمایشی؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 3400000000, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'other', 'DEMO-1404-007', date '2025-11-11', 'd0000000-0000-4000-8000-000000000005', 'نمونه آزمایشی — سند پشتیبان عملیات؛ فاقد اعتبار مالی', 'IRR', null, 'registered', 'manual'),
  ('d3000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'sales_invoice', 'DEMO-1404-008', date '2026-01-05', 'd0000000-0000-4000-8000-000000000003', 'نمونه آزمایشی — فاکتور خدمات پشتیبانی؛ مبلغ صرفاً نمایشی و فاقد اعتبار مالی', 'IRR', 1750000000, 'registered', 'manual')
on conflict do nothing;

commit;
