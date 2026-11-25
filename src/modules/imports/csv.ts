/**
 * Minimal, dependency-free CSV reader for the import pipeline.
 * Handles quoted fields, embedded commas/newlines, BOM and CRLF.
 * The first row is the header; data rows become SourceRecords.
 */

import type { SourceRecord } from "./types";

export function parseCsv(text: string): SourceRecord[] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows = parseRows(clean);
  if (rows.length === 0) return [];
  const header = (rows[0] as string[]).map((h) => h.trim());
  const out: SourceRecord[] = [];
  let rowNo = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as string[];
    // skip fully empty lines
    if (row.length === 1 && (row[0] ?? "").trim() === "") continue;
    rowNo += 1;
    const fields: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      fields[key] = (row[c] ?? "").trim();
    }
    out.push({ rowNo, fields });
  }
  return out;
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch === "\r") {
      // handled by \n; ignore stray CR
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
