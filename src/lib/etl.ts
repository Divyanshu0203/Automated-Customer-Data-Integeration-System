import { csvToRecords } from "./csv";
import { flatten, withLeafKeys } from "./flatten";
import { xmlToRecords } from "./xml";
import { analyzeSentiment, labelFor } from "./sentiment";
import type {
  Customer,
  DatasetFormat,
  DatasetInput,
  DatasetStats,
  FeedbackEntry,
  IntegrationResult,
  RawRecord,
  Sentiment,
  SentimentSummary,
} from "./types";

/* ------------------------------------------------------------------ */
/* Extract: parse files and map messy headers onto canonical fields    */
/* ------------------------------------------------------------------ */

type Field =
  | "name" | "firstName" | "lastName" | "email" | "phone" | "company"
  | "city" | "country" | "date" | "amount" | "feedback";

const ALIASES = new Map<string, Field>();
function alias(field: Field, names: string[]) {
  for (const n of names) ALIASES.set(n, field);
}
alias("name", ["name", "fullname", "customername", "customer", "clientname", "contactname"]);
alias("firstName", ["firstname", "first", "givenname", "fname"]);
alias("lastName", ["lastname", "last", "surname", "familyname", "lname"]);
alias("email", ["email", "emailaddress", "mail", "emailid", "customeremail"]);
alias("phone", ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "tel", "telephone", "cell"]);
alias("company", ["company", "organization", "organisation", "companyname", "employer", "business"]);
alias("city", ["city", "town", "location"]);
alias("country", ["country", "countrycode", "nation"]);
alias("date", ["date", "createdat", "signupdate", "joined", "joineddate", "registrationdate", "orderdate", "createdon", "signedupat"]);
alias("amount", ["amount", "revenue", "orderamount", "total", "price", "purchase", "purchaseamount", "spend", "totalamount", "ordervalue"]);
alias("feedback", ["feedback", "comment", "comments", "review", "remarks", "message", "feedbacktext"]);

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function detectFormat(ds: DatasetInput): DatasetFormat {
  if (ds.format) return ds.format;
  const name = ds.name.toLowerCase();
  if (/\.(ndjson|jsonl)$/.test(name)) return "ndjson";
  if (/\.json$/.test(name)) return "json";
  if (/\.xml$/.test(name)) return "xml";
  if (/\.(csv|tsv|tab|psv|txt)$/.test(name)) return "csv";

  // No useful extension (e.g. pasted text): look at the content.
  const head = ds.content.trimStart();
  if (head.startsWith("<")) return "xml";
  if (head.startsWith("[")) return "json";
  if (head.startsWith("{")) return head.includes("\n{") ? "ndjson" : "json";
  return "csv";
}

function parseNdjson(text: string): unknown[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function parseDataset(ds: DatasetInput): RawRecord[] {
  const format = detectFormat(ds);
  if (format === "csv") return csvToRecords(ds.content);
  if (format === "xml") return xmlToRecords(ds.content);

  let list: unknown;
  if (format === "ndjson") {
    list = parseNdjson(ds.content);
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ds.content);
    } catch (err) {
      try {
        parsed = parseNdjson(ds.content); // maybe it is NDJSON after all
      } catch {
        throw err;
      }
    }
    list = parsed;
    if (!Array.isArray(parsed) && parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      // A list under a common key, otherwise treat the object as one record.
      list = obj.data ?? obj.records ?? obj.customers ?? obj.items ?? obj.rows ?? [obj];
    }
  }

  if (!Array.isArray(list)) {
    throw new Error("JSON must be an array of objects (or an object with a data/records array)");
  }
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item) => withLeafKeys(flatten(item)));
}

function mapRecord(raw: RawRecord): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = ALIASES.get(normalizeHeader(header));
    const v = value.trim();
    if (field && v && out[field] === undefined) out[field] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Transform: clean individual values                                   */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function cleanName(s: string): string {
  // Re-case each word that is entirely upper or lower case; leave mixed-case
  // words such as "McDonald" untouched.
  return cleanText(s)
    .split(" ")
    .map((word) => {
      if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
      return word
        .toLowerCase()
        .replace(/(^|[\-'])([a-z\u00C0-\u024F])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
    })
    .join(" ");
}

function normalizePhone(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return s.trim().startsWith("+") ? `+${digits}` : digits;
}

/** Phones match on their last 10 digits so "+91 98765 43210" == "098765 43210". */
function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): string {
  const v = s.trim();
  if (!v) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(v);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    // Day-first (DD/MM/YYYY), the common format outside the US.
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  } else {
    const t = Date.parse(v);
    return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return valid ? date.toISOString().slice(0, 10) : "";
}

function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ------------------------------------------------------------------ */
/* Load: merge rows that share an email or phone into one customer     */
/* ------------------------------------------------------------------ */

interface CleanRow {
  source: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  country: string;
  date: string;
  amount: number | null;
  feedback: string;
}

const MAX_ISSUES = 50;

export function integrate(datasets: DatasetInput[]): IntegrationResult {
  const issues: string[] = [];
  const addIssue = (msg: string) => {
    if (issues.length < MAX_ISSUES) issues.push(msg);
  };

  const rows: CleanRow[] = [];
  const stats: DatasetStats[] = [];
  let invalidEmails = 0;

  for (const ds of datasets) {
    let records: RawRecord[];
    try {
      records = parseDataset(ds);
    } catch (err) {
      addIssue(`${ds.name}: could not be read (${err instanceof Error ? err.message : "parse error"})`);
      stats.push({ name: ds.name, rowsIn: 0, rowsAccepted: 0, rowsRejected: 0 });
      continue;
    }

    const stat: DatasetStats = { name: ds.name, rowsIn: records.length, rowsAccepted: 0, rowsRejected: 0 };

    records.forEach((raw, idx) => {
      const m = mapRecord(raw);

      let email = "";
      const rawEmail = (m.email ?? "").trim().toLowerCase();
      if (rawEmail) {
        if (EMAIL_RE.test(rawEmail)) {
          email = rawEmail;
        } else {
          invalidEmails++;
          addIssue(`${ds.name} record ${idx + 1}: invalid email "${rawEmail}"`);
        }
      }
      const phone = normalizePhone(m.phone ?? "");

      if (!email && !phone) {
        stat.rowsRejected++;
        addIssue(`${ds.name} record ${idx + 1}: no valid email or phone, skipped`);
        return;
      }

      const name = m.name ?? [m.firstName, m.lastName].filter(Boolean).join(" ");
      stat.rowsAccepted++;
      rows.push({
        source: ds.name,
        name: name ? cleanName(name) : "",
        email,
        phone,
        company: cleanText(m.company ?? ""),
        city: cleanName(m.city ?? ""),
        country: cleanText(m.country ?? ""),
        date: parseDate(m.date ?? ""),
        amount: m.amount ? parseAmount(m.amount) : null,
        feedback: cleanText(m.feedback ?? ""),
      });
    });
    stats.push(stat);
  }

  // Union-find: rows sharing an email OR a phone belong to the same customer.
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const seen = new Map<string, number>();
  rows.forEach((row, i) => {
    const keys: string[] = [];
    if (row.email) keys.push(`e:${row.email}`);
    if (row.phone) keys.push(`p:${phoneKey(row.phone)}`);
    for (const key of keys) {
      const first = seen.get(key);
      if (first === undefined) seen.set(key, i);
      else union(i, first);
    }
  });

  const groups = new Map<number, CleanRow[]>();
  rows.forEach((row, i) => {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(row);
    else groups.set(root, [row]);
  });

  const customers: Customer[] = [];
  const allFeedback: FeedbackEntry[] = [];

  for (const group of groups.values()) {
    const first = <K extends keyof CleanRow>(key: K): string => {
      for (const r of group) {
        const v = r[key];
        if (typeof v === "string" && v) return v;
      }
      return "";
    };

    const email = first("email");
    const phone = first("phone");
    const dates = group.map((r) => r.date).filter(Boolean).sort();

    const amounts = group.map((r) => r.amount).filter((a): a is number => a !== null);
    const feedback: FeedbackEntry[] = [];
    const seenText = new Set<string>();
    for (const r of group) {
      if (!r.feedback || seenText.has(r.feedback)) continue;
      seenText.add(r.feedback);
      const s = analyzeSentiment(r.feedback);
      feedback.push({ text: r.feedback, sentiment: s.label, polarity: s.polarity, source: r.source });
    }
    allFeedback.push(...feedback);

    const avg = feedback.length ? feedback.reduce((sum, f) => sum + f.polarity, 0) / feedback.length : null;

    customers.push({
      id: `cus_${shortHash(email || `p:${phoneKey(phone)}`)}`,
      name: first("name"),
      email,
      phone,
      company: first("company"),
      city: first("city"),
      country: first("country"),
      createdAt: dates[0] ?? "",
      totalSpend: Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100,
      orders: amounts.length,
      feedback,
      sentiment: avg === null ? null : labelFor(avg),
      sources: [...new Set(group.map((r) => r.source))],
    });
  }

  return {
    customers,
    report: {
      datasets: stats,
      rowsIn: stats.reduce((a, s) => a + s.rowsIn, 0),
      rowsRejected: stats.reduce((a, s) => a + s.rowsRejected, 0),
      invalidEmails,
      duplicatesMerged: rows.length - customers.length,
      customersOut: customers.length,
      issues,
    },
    sentiment: summarizeSentiment(allFeedback.map((f) => ({ label: f.sentiment, polarity: f.polarity }))),
  };
}

export function summarizeSentiment(items: { label: Sentiment; polarity: number }[]): SentimentSummary {
  const counts: Record<Sentiment, number> = { Positive: 0, Negative: 0, Neutral: 0 };
  let sum = 0;
  for (const it of items) {
    counts[it.label]++;
    sum += it.polarity;
  }
  return {
    counts,
    total: items.length,
    averagePolarity: items.length ? Math.round((sum / items.length) * 1000) / 1000 : 0,
  };
}