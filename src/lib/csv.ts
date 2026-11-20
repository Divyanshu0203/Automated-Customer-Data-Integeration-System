import type { RawRecord } from "./types";

const DELIMITERS = [",", ";", "\t", "|"];

function detectDelimiter(headerLine: string): string {
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Parse CSV text into rows of cells. Handles quotes, escaped quotes, CRLF, BOM. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
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
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parse CSV text into records keyed by the header row. */
export function csvToRecords(input: string): RawRecord[] {
  const rows = parseCsv(input);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const rec: RawRecord = {};
    headers.forEach((h, i) => {
      if (h) rec[h] = (cells[i] ?? "").trim();
    });
    return rec;
  });
}

function escapeCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formula injection (=, @, and +/- not followed by a digit).
  if (/^[=@\t\r]/.test(s) || /^[+-](?!\d)/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV with the given column order. */
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map(escapeCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => escapeCell(r[c])).join(","));
  return lines.join("\n") + "\n";
}