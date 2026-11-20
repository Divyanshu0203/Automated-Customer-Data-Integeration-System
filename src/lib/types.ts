export type DatasetFormat = "csv" | "json" | "ndjson" | "xml";

export interface DatasetInput {
  /** Display name, usually the file name (e.g. "crm.csv"). */
  name: string;
  /** Optional. Detected from the file extension or content when omitted. */
  format?: DatasetFormat;
  /** Raw file contents. */
  content: string;
}

export type RawRecord = Record<string, string>;

export type Sentiment = "Positive" | "Negative" | "Neutral";

export interface SentimentResult {
  label: Sentiment;
  /** -1 (very negative) to +1 (very positive). */
  polarity: number;
}

export interface FeedbackEntry {
  text: string;
  sentiment: Sentiment;
  polarity: number;
  source: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  country: string;
  /** Earliest known date, YYYY-MM-DD, or empty. */
  createdAt: string;
  totalSpend: number;
  orders: number;
  feedback: FeedbackEntry[];
  /** Overall sentiment across this customer's feedback, or null if none. */
  sentiment: Sentiment | null;
  sources: string[];
}

export interface DatasetStats {
  name: string;
  rowsIn: number;
  rowsAccepted: number;
  rowsRejected: number;
}

export interface IntegrationReport {
  datasets: DatasetStats[];
  rowsIn: number;
  rowsRejected: number;
  invalidEmails: number;
  duplicatesMerged: number;
  customersOut: number;
  /** Human-readable problems found while cleaning (capped). */
  issues: string[];
}

export interface SentimentSummary {
  counts: Record<Sentiment, number>;
  averagePolarity: number;
  total: number;
}

export interface IntegrationResult {
  customers: Customer[];
  report: IntegrationReport;
  sentiment: SentimentSummary;
}