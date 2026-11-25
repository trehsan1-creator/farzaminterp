import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
const allSql = files.map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")).join("\n");

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}
const sql = stripComments(allSql);

const REQUIRED_TABLES = [
  "companies","company_members","fiscal_years","fiscal_periods","chart_of_accounts",
  "counterparties","bank_accounts","documents","import_batches","import_source_files",
  "import_staging_records","bank_transactions","sales_invoices","purchase_invoices",
  "tax_returns","fixed_assets","journal_entries","journal_entry_lines","reconciliation_items",
  "approvals","audit_events","products","warehouses","inventory_movements","employees",
  "payroll_runs","payroll_items","sales_invoice_lines","purchase_invoice_lines",
  "bank_account_opening_balances","opening_balance_proposals","source_observations",
  "management_questions","agent_tasks","agent_task_idempotency","agent_audit_log","agent_policy",
];

describe("migrations — versioning and coverage", () => {
  it("uses ordered, versioned migration filenames", () => {
    expect(files.length).toBeGreaterThanOrEqual(16);
    for (const file of files) expect(file).toMatch(/^\d{14}_\d{4}_[a-z0-9_]+\.sql$/);
    expect(files).toEqual([...files].sort());
  });

  it("creates every required business and orchestration table", () => {
    for (const table of REQUIRED_TABLES) {
      const pattern = new RegExp("create table (?:if not exists )?(?:public\\.)?" + table + "\\b", "i");
      expect(pattern.test(sql), "missing table: " + table).toBe(true);
    }
  });
});

describe("migrations — row-level security", () => {
  it("enables RLS on every required table", () => {
    for (const table of REQUIRED_TABLES) {
      const pattern = new RegExp("alter table (?:public\\.)?" + table + " enable row level security", "i");
      expect(pattern.test(sql), "RLS not enabled: " + table).toBe(true);
    }
  });

  it("defines membership predicates and private wrappers", () => {
    expect(sql).toMatch(/create or replace function fz_is_company_member/);
    expect(sql).toMatch(/create or replace function fz_has_role/);
    expect(sql).toMatch(/create or replace function private\.fz_is_company_member/);
    expect(sql).toMatch(/create or replace function private\.fz_has_role/);
  });

  it("revokes anonymous table access", () => {
    expect(sql).toMatch(/revoke all on all tables in schema public from anon/);
  });
});

describe("migrations — exact money and quantities", () => {
  it("uses exact integer precision for monetary amounts and scale only for quantities", () => {
    const declarations = [...sql.matchAll(/^\s*(\w+)\s+numeric\(([^)]+)\)/gim)];
    expect(declarations.length).toBeGreaterThan(20);
    for (const declaration of declarations) {
      const column = declaration[1];
      const precision = (declaration[2] ?? "").replace(/\s+/g, "");
      if (column === "quantity") expect(precision).toBe("20,3");
      else expect(precision).toBe("20,0");
    }
  });

  it("declares explicit currencies for financial amounts", () => {
    expect(sql).toMatch(/currency\s+char\(3\) not null default 'IRR'/);
    expect(sql).toMatch(/check \(currency in \('IRR', 'IRT'\)\)/);
    expect(sql).toMatch(/list_price_rial numeric\(20,0\)/);
    expect(sql).toMatch(/payroll_items[\s\S]*?gross_pay_rial numeric\(20,0\)/);
    expect(sql).toMatch(/sales_invoice_lines[\s\S]*?line_total_rial numeric\(20,0\)/);
  });

  it("does not introduce floating-point or ambiguous money types", () => {
    expect(sql).not.toMatch(/\bdouble precision\b/i);
    expect(sql).not.toMatch(/\breal\b/i);
    expect(sql).not.toMatch(/\bmoney\b/i);
    expect(sql).not.toMatch(/\bfloat\b/i);
  });

  it("uses canonical SQL dates rather than text dates", () => {
    expect(sql).not.toMatch(/\w+_date\s+text\b/i);
    expect(sql).toMatch(/entry_date\s+date not null/);
    expect(sql).toMatch(/document_date\s+date/);
  });
});

describe("migrations — double-entry integrity", () => {
  it("defines balance assertion and the posting gate", () => {
    expect(sql).toMatch(/create or replace function fz_assert_entry_balanced/);
    expect(sql).toMatch(/ENTRY_UNBALANCED/);
    expect(sql).toMatch(/ENTRY_TOO_FEW_LINES/);
    expect(sql).toMatch(/fz_assert_journal_entry_status/);
    expect(sql).toMatch(/ENTRY_POSTED_IMMUTABLE/);
    expect(sql).toMatch(/ENTRY_CANNOT_UNPOST/);
  });

  it("makes posted journal lines immutable and supports reversal", () => {
    expect(sql).toMatch(/fz_assert_journal_line_guard/);
    expect(sql).toMatch(/ENTRY_LINES_IMMUTABLE/);
    expect(sql).toMatch(/before insert or update or delete on journal_entry_lines/);
    expect(sql).toMatch(/create or replace function reverse_journal_entry/);
    expect(sql).toMatch(/REVERSAL_REASON_REQUIRED/);
  });

  it("requires approval before fiscal-year close", () => {
    expect(sql).toMatch(/fiscal_years_close_gate/);
    expect(sql).toMatch(/FY_CLOSE_APPROVAL_REQUIRED/);
    expect(sql).toMatch(/FY_IMMUTABLE_BOUNDARIES/);
  });

  it("keeps both business and agent audit trails append-only", () => {
    expect(sql).toMatch(/audit_events_append_only/);
    expect(sql).toMatch(/APPEND_ONLY_TABLE/);
    expect(sql).toMatch(/agent_audit_append_only/);
    expect(sql).toMatch(/AGENT_AUDIT_APPEND_ONLY/);
  });
});

describe("migrations — source preservation and import idempotency", () => {
  it("hash-verifies and deduplicates source files per company", () => {
    expect(sql).toMatch(/content_sha256\s+text not null check \(content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(sql).toMatch(/uq_import_source_files_company_hash/);
    expect(sql).toMatch(/SOURCE_FILE_IMMUTABLE/);
    expect(sql).toMatch(/external_reference/);
  });

  it("gives each import batch a unique idempotency key", () => {
    expect(sql).toMatch(/idempotency_key\s+text not null unique/);
    expect(allSql).toMatch(/sha256\(company \| fiscal_year \| source_sha256 \| pipeline_version\)/i);
    expect(fs.readFileSync(path.resolve(process.cwd(), "src/modules/imports/hashing.ts"), "utf8"))
      .toContain("computeIdempotencyKey");
  });

  it("deduplicates staging rows and posted financial records", () => {
    expect(sql).toMatch(/unique \(import_batch_id, source_row_no\)/);
    expect(sql).toMatch(/unique \(import_batch_id, source_line_hash\)/);
    expect(sql).toMatch(/uq_documents_content_hash/);
    expect(sql).toMatch(/uq_journal_entries_content_hash/);
    expect(sql).toMatch(/uq_bank_transactions_content_hash/);
  });

  it("gates import posting behind approved, valid staging", () => {
    expect(sql).toMatch(/create or replace function post_import_batch/);
    expect(sql).toMatch(/APPROVAL_REQUIRED/);
    expect(sql).toMatch(/STAGING_NOT_VALID/);
    expect(sql).toMatch(/OPEN_ERROR_ISSUES/);
    expect(sql).toMatch(/UNSUPPORTED_KIND_PENDING/);
    expect(sql).toMatch(/already_posted/);
  });
});

describe("migrations — agent task orchestration", () => {
  it("implements lease claim, heartbeat, release, completion, failure and reaping", () => {
    for (const fn of [
      "fz_agent_claim_task","fz_agent_heartbeat_task","fz_agent_release_task",
      "fz_agent_complete_task","fz_agent_fail_task","fz_agent_needs_human_task",
      "fz_agent_reap_stale_tasks",
    ]) {
      expect(sql, "missing function " + fn).toMatch(new RegExp("function public\\." + fn));
    }
  });

  it("stores idempotent receipts and keeps the agent audit append-only", () => {
    expect(sql).toMatch(/create table if not exists public\.agent_task_idempotency/);
    expect(sql).toMatch(/unique\(task_id,operation,idempotency_key\)/);
    expect(sql).toMatch(/agent_task_idempotency_no_client_access/);
    expect(sql).toMatch(/create table if not exists public\.agent_audit_log/);
  });

  it("does not expose posting or payment actions to the agent", () => {
    expect(sql).not.toMatch(/fz_agent_post_journal_entry/);
    expect(sql).not.toMatch(/fz_agent_execute_payment/);
    expect(sql).toMatch(/revoke execute on function public\.post_journal_entry/);
    expect(sql).toMatch(/revoke execute on function public\.reverse_journal_entry/);
  });
});

describe("migrations — seed restrictions", () => {
  const seed = stripComments(
    files.filter((file) => file.includes("seed"))
      .map((file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"))
      .join("\n"),
  );

  it("seeds FY1404 as an open reconstruction workspace", () => {
    expect(seed).toMatch(/insert into companies/);
    expect(seed).toMatch(/insert into fiscal_years/);
    expect(seed).toMatch(/'1404'/);
    expect(seed).toMatch(/date '2025-03-21'/);
    expect(seed).toMatch(/date '2026-03-20'/);
    expect(seed).toMatch(/'open'/);
    expect(seed).toMatch(/is_reconstruction/);
    expect(seed).not.toMatch(/'closed'/);
    expect(seed).not.toMatch(/'locked'/);
  });

  it("seeds the twelve 1404 periods without overlapping them", () => {
    const periodInserts = seed.match(/insert into fiscal_periods[\s\S]*?on conflict/g);
    expect(periodInserts).toHaveLength(1);
    expect((seed.match(/,\s*'open'\)/g) ?? []).length).toBe(12);
  });

  it("does not seed financial records or opening balances", () => {
    for (const table of [
      "journal_entries","journal_entry_lines","documents","bank_transactions",
      "sales_invoices","purchase_invoices","fixed_assets","tax_returns",
      "chart_of_accounts","opening_balance_proposals",
    ]) {
      expect(seed, "seed must not touch " + table).not.toMatch(new RegExp("insert into " + table, "i"));
    }
    expect(seed).not.toMatch(/opening/i);
    expect(seed).not.toMatch(/موجودی اول دوره/i);
  });
});
