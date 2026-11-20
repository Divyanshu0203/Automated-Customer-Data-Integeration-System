import { NextResponse } from "next/server";
import { integrate } from "@/lib/etl";
import { toCsv } from "@/lib/csv";
import type { DatasetFormat, DatasetInput } from "@/lib/types";

export const runtime = "nodejs";

// Vercel serverless request bodies are capped at ~4.5 MB, so stay under that.
const MAX_TOTAL_CHARS = 4_000_000;
const MAX_DATASETS = 10;
const FORMATS = ["csv", "json", "ndjson", "xml"];

const CSV_COLUMNS = [
  "id", "name", "email", "phone", "company", "city", "country",
  "createdAt", "totalSpend", "orders", "sentiment", "sources",
];

function validate(body: unknown): DatasetInput[] | string {
  if (!body || typeof body !== "object") return "Body must be a JSON object";
  const datasets = (body as { datasets?: unknown }).datasets;
  if (!Array.isArray(datasets) || datasets.length === 0) return "`datasets` must be a non-empty array";
  if (datasets.length > MAX_DATASETS) return `At most ${MAX_DATASETS} datasets per request`;

  let total = 0;
  const out: DatasetInput[] = [];
  for (const d of datasets) {
    if (!d || typeof d !== "object") return "Each dataset must be an object";
    const { name, content, format } = d as Record<string, unknown>;
    if (typeof name !== "string" || typeof content !== "string") {
      return "Each dataset needs string `name` and `content`";
    }
    if (format !== undefined && !FORMATS.includes(format as string)) {
      return "`format` must be one of: csv, json, ndjson, xml";
    }
    total += content.length;
    out.push({ name: name.slice(0, 200), content, format: format as DatasetFormat | undefined });
  }
  if (total > MAX_TOTAL_CHARS) return "Payload too large (max ~4 MB total)";
  return out;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const datasets = validate(body);
  if (typeof datasets === "string") {
    return NextResponse.json({ error: datasets }, { status: 400 });
  }

  const result = integrate(datasets);

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const rows = result.customers.map((c) => ({ ...c, sources: c.sources.join("; ") }));
    return new NextResponse(toCsv(rows, CSV_COLUMNS), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="customers.csv"',
      },
    });
  }

  return NextResponse.json(result);
}