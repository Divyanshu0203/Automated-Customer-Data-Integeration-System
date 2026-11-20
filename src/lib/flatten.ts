import type { RawRecord } from "./types";

export function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

/** Flatten nested JSON into { "address.city": "Pune", ... }. */
export function flatten(
  obj: Record<string, unknown>,
  prefix = "",
  out: RawRecord = {},
  depth = 0,
): RawRecord {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out[key] = v.every((x) => x === null || typeof x !== "object")
        ? v.map(toText).filter(Boolean).join(", ")
        : "";
    } else if (v && typeof v === "object") {
      if (depth < 10) flatten(v as Record<string, unknown>, key, out, depth + 1);
    } else {
      out[key] = toText(v);
    }
  }
  return out;
}

/** Also expose "address.city" as "city" so column matching still works. */
export function withLeafKeys(rec: RawRecord): RawRecord {
  for (const [key, value] of Object.entries(rec)) {
    const dot = key.lastIndexOf(".");
    if (dot === -1) continue;
    const leaf = key.slice(dot + 1);
    if (leaf && !(leaf in rec)) rec[leaf] = value;
  }
  return rec;
}