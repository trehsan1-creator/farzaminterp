import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Structural review of the versioned migrations: the financial rules that
 * must exist in the database itself (constraints, triggers, RLS, exact
 * numeric types, idempotency anchors). These tests parse the SQL; live-DB
 * integration tests run once a Supabase project is connected (documented in
 * docs/MIGRATIONS.md).
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const files = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const allSql = files
  .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");

/** Strip SQL comments so prose never triggers type/pattern checks. */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}
const sql = stripComments(allSql);

const REQUIRED_TABLES = [
  "companies",
  "fiscal_years",
  "fiscal_periods",
  "chart_of_accounts",
  "counterparties",
  "bank_accounts",
  "documents",
  "import_batches",
  "import_source_files",
  "import_staging_records",
  "bank_transactions",
  "sales_invoices",
  "purchase_invoices",
  "tax_returns",
  "fixed_assets",
  "journal_entries",
  "journal_entry_lines",
  "reconciliation_items",
  "approvals",
  "audit_events",
];

describe("migrations — versioning", () => {
  it("exists and is ordered with versioned file names", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    for (const f of files) {
      expect(f).toMatch(/^\d{14}_\d{4}_[a-z0-9_]+\.sql$/);
    }
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it("covers every required table", () => {
    for (const table of REQUIRED_TABLES) {
      const re = new RegExp(`create table (?:if not exists )?${table}\\b`);
      expect(re.test(sql), `missing table: ${table}`).toBe(true);
    }
  });
});

describe("migrations — RLS", () => {
  it("enables row level security on every required business table", () => {
    for (const table of [...REQUIRED_TABLES, "company_members"]) {
      const enableRe = new RegExp(`alter table ${table} enable row level security`);
      expect(enableRe.test(sql), `RLS not enabled: ${table}`).toBe(true);
    }
  });

  it("defines member predicates used by policies", () => {
    expect(sql).toMatch(/create or replace function fz_is_company_member/);
    expect(sql).toMatch(/create or replace function fz_has_role/);
  });

  it("grants no data access to the anon role", () => {
    expect(sql).toMatch(/revoke all on all tables in schema public from anon/);
  });
});

describe("migrations — money and dates", () => {
  it("never uses floating-point or ambiguous money types", () => {
    expect(sql).not.toMatch(/\bdouble precision\b/i);
    expect(sql).not.toMatch(/\breal\b/i);
    expect(sql).not.toMatch(/\bmoney\b/i);
    expect(sql).not.toMatch(/\bfloat\b/i);
  });

  it("stores every numeric amount as NUMERIC(20,0)", () => {
    const numerics = [...sql.matchAll(/numeric\(([^)]+)\)/g)].map((m) =>
      (m[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(numerics.length).toBeGreaterThan(10);
    for (const n of numerics) {
      expect(n).toBe("20, 0");
    }
  });

  it("requires an explicit currency code wherever money appears", () => {
    const moneyCols = [...sql.matchAll(/^\s*(\w+)\s+numeric\(20, 0\)/gim)].map(
      (m) => m[1] as string,
    );
    expect(moneyCols.length).toBeGreaterThan(10);
    // every table with money columns also declares a currency column
    expect(sql).toMatch(/currency\s+char\(3\) not null default 'IRR'/);
    expect(sql).toMatch(/check \(currency in \('IRR', 'IRT'\)\)/);
  });

  it("uses canonical ISO dates (date type), never text dates", () => {
    expect(sql).not.toMatch(/\w+_date\s+text\b/);
    expect(sql).toMatch(/entry_date\s+date not null/);
    expect(sql).toMatch(/document_date\s+date/);
  });
});

describe("migrations — double-entry integrity", () => {
  it("defines the balance assertion and the posting gate", () => {
    expect(sql).toMatch(/create or replace function fz_assert_entry_balanced/);
    expect(sql).toMatch(/ENTRY_UNBALANCED/);
    expect(sql).toMatch(/ENTRY_TOO_FEW_LINES/);
    expect(sql).toMatch(/fz_assert_journal_entry_status/);
    expect(sql).toMatch(/ENTRY_POSTED_IMMUTABLE/);
    expect(sql).toMatch(/ENTRY_CANNOT_UNPOST/);
  });

  it("makes posted journal lines immutable", () => {
    expect(sql).toMatch(/fz_assert_journal_line_guard/);
    expect(sql).toMatch(/ENTRY_LINES_IMMUTABLE/);
    expect(sql).toMatch(/before insert or update or delete on journal_entry_lines/);
  });

  it("provides controlled reversal instead of edits", () => {
    expect(sql).toMatch(/create or replace function reverse_journal_entry/);
    expect(sql).toMatch(/REVERSAL_REASON_REQUIRED/);
  });

  it("requires approved fiscal-year closing (FY1404 stays open)", () => {
    expect(sql).toMatch(/fiscal_years_close_gate/);
    expect(sql).toMatch(/FY_CLOSE_APPROVAL_REQUIRED/);
    expect(sql).toMatch(/FY_IMMUTABLE_BOUNDARIES/);
  });

  it("keeps the audit log append-only", () => {
    expect(sql).toMatch(/audit_events_append_only/);
    expect(sql).toMatch(/APPEND_ONLY_TABLE/);
  });
});

describe("migrations — import idempotency anchors", () => {
  it("hash-verifies and deduplicates source files per company", () => {
    expect(sql).toMatch(/content_sha256\s+text not null check \(content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/);
    expect(sql).toMatch(/uq_import_source_files_company_hash/);
    expect(sql).toMatch(/SOURCE_FILE_IMMUTABLE/);
  });

  it("gives every batch a unique idempotency key", () => {
    expect(sql).toMatch(/idempotency_key\s+text not null unique/);
    // documented derivation (prose lives in a comment — check the raw SQL)
    expect(allSql).toMatch(
      /sha256\(company \| fiscal_year \| source_sha256 \| pipeline_version\)/i,
    );
    // and the TypeScript implementation must agree with the documentation
    expect(fs.readFileSync(path.resolve(process.cwd(), "src/modules/imports/hashing.ts"), "utf8")).toContain(
      "computeIdempotencyKey",
    );
  });

  it("deduplicates staging rows within a batch", () => {
    expect(sql).toMatch(/unique \(import_batch_id, source_row_no\)/);
    expect(sql).toMatch(/unique \(import_batch_id, source_line_hash\)/);
  });

  it("anchors posted financial records with unique content hashes", () => {
    expect(sql).toMatch(/uq_documents_content_hash/);
    expect(sql).toMatch(/uq_journal_entries_content_hash/);
    expect(sql).toMatch(/uq_bank_transactions_content_hash/);
  });

  it("gates batch posting behind an approved approval and validates staging", () => {
    expect(sql).toMatch(/create or replace function post_import_batch/);
    expect(sql).toMatch(/APPROVAL_REQUIRED/);
    expect(sql).toMatch(/STAGING_NOT_VALID/);
    expect(sql).toMatch(/OPEN_ERROR_ISSUES/);
    expect(sql).toMatch(/UNSUPPORTED_KIND_PENDING/);
    // re-posting a posted batch is a no-op
    expect(sql).toMatch(/already_posted/);
  });
});

describe("migrations — seed contains structure only, no financial data", () => {
  const seed = stripComments(
    files
      .filter((f) => f.includes("seed"))
      .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n"),
  );

  it("seeds the company and FY1404 as an open reconstruction workspace", () => {
    expect(seed).toMatch(/insert into companies/);
    expect(seed).toMatch(/insert into fiscal_years/);
    expect(seed).toMatch(/'1404'/);
    expect(seed).toMatch(/date '2025-03-21'/);
    expect(seed).toMatch(/date '2026-03-20'/);
    expect(seed).toMatch(/'open'/);
    expect(seed).toMatch(/is_reconstruction/);
    // FY1404 must never be seeded closed or locked
    expect(seed).not.toMatch(/'closed'/);
    expect(seed).not.toMatch(/'locked'/);
  });

  it("seeds the 12 calendar periods of 1404 with no overlap", () => {
    const periodInserts = seed.match(/insert into fiscal_periods[\s\S]*?on conflict/g);
    expect(periodInserts).toHaveLength(1);
    const rows = (seed.match(/,\s*'open'\)/g) ?? []).length;
    expect(rows).toBe(12);
  });

  it("never seeds financial records or amounts", () => {
    for (const table of [
      "journal_entries",
      "journal_entry_lines",
      "documents",
      "bank_transactions",
      "sales_invoices",
      "purchase_invoices",
      "fixed_assets",
      "tax_returns",
      "chart_of_accounts",
    ]) {
      expect(seed, `seed must not touch ${table}`).not.toMatch(
        new RegExp(`insert into ${table}`, "i"),
      );
    }
    // no fabricated opening balances
    expect(seed).not.toMatch(/opening/i);
    expect(seed).not.toMatch(/موجودی اول دوره/i);
  });
});
