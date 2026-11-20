"use client";

import { useRef, useState } from "react";
import readXlsxFile from "read-excel-file";
import { SAMPLE_DATASETS } from "@/lib/sample";
import type { DatasetInput, IntegrationResult, Sentiment } from "@/lib/types";

const MAX_BYTES = 4_000_000;
const SENTIMENTS: Sentiment[] = ["Positive", "Neutral", "Negative"];
const BAR_COLOR: Record<Sentiment, string> = {
  Positive: "var(--pos)",
  Neutral: "var(--neu)",
  Negative: "var(--neg)",
};

/** Turn spreadsheet rows into CSV text so the server can read them. */
function rowsToCsv(rows: unknown[][]): string {
  const cell = (v: unknown) => {
    const s =
      v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

export default function Home() {
  const [datasets, setDatasets] = useState<DatasetInput[]>([]);
  const [result, setResult] = useState<IntegrationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pasted, setPasted] = useState("");
  const [pasteCount, setPasteCount] = useState(1);
  const fileInput = useRef<HTMLInputElement>(null);

  const totalBytes = datasets.reduce((n, d) => n + d.content.length, 0);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const added: DatasetInput[] = [];
    for (const file of Array.from(files)) {
      try {
        if (/\.xlsx$/i.test(file.name)) {
          const rows = await readXlsxFile(file); // first sheet only
          added.push({ name: file.name, format: "csv", content: rowsToCsv(rows as unknown[][]) });
        } else if (/\.xls$/i.test(file.name)) {
          setError(`${file.name}: old .xls files are not supported. Save it as .xlsx or .csv first.`);
        } else {
          added.push({ name: file.name, content: await file.text() });
        }
      } catch {
        setError(`${file.name}: could not be read.`);
      }
    }
    setDatasets((prev) => [...prev, ...added]);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function addPasted() {
    if (!pasted.trim()) return;
    setDatasets((prev) => [...prev, { name: `pasted-${pasteCount}`, content: pasted }]);
    setPasteCount((n) => n + 1);
    setPasted("");
    setResult(null);
  }

  async function run() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/integrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datasets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data as IntegrationResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function downloadCsv() {
    const res = await fetch("/api/integrate?format=csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasets }),
    });
    if (!res.ok) return setError("Could not export CSV");
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const maxCount = result ? Math.max(1, ...SENTIMENTS.map((s) => result.sentiment.counts[s])) : 1;

  return (
    <main>
      <h1>Customer Data Integration</h1>
      <p className="sub">
        Upload customer data from several sources. Records are cleaned, matched by email or phone, merged into one
        profile per customer, and feedback is scored for sentiment.
      </p>

      <section className="card">
        <h2>1. Add data sources</h2>
        <div className="row">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.tsv,.txt,.json,.ndjson,.jsonl,.xml,.xlsx"
            multiple
            hidden
            onChange={(e) => addFiles(e.target.files)}
          />
          <button onClick={() => fileInput.current?.click()}>Upload file</button>
          <button onClick={() => { setDatasets(SAMPLE_DATASETS); setResult(null); }}>Load sample data</button>
          {datasets.length > 0 && (
            <button onClick={() => { setDatasets([]); setResult(null); }}>Clear</button>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Or paste CSV, JSON, NDJSON or XML data here…"
            aria-label="Paste data"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={addPasted} disabled={!pasted.trim()}>Add pasted data</button>
          </div>
        </div>

        {datasets.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {datasets.map((d, i) => (
              <div className="file" key={`${d.name}-${i}`}>
                <span>
                  {d.name} <small>({(d.content.length / 1024).toFixed(1)} KB)</small>
                </span>
                <button onClick={() => { setDatasets(datasets.filter((_, j) => j !== i)); setResult(null); }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <button
            className="primary"
            disabled={busy || datasets.length === 0 || totalBytes > MAX_BYTES}
            onClick={run}
          >
            {busy ? "Processing…" : "Integrate data"}
          </button>
          {totalBytes > MAX_BYTES && <span className="error">Files exceed the 4 MB limit.</span>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {result && (
        <>
          <div className="stats">
            <div className="stat"><b>{result.report.rowsIn}</b><span>Rows read</span></div>
            <div className="stat"><b>{result.report.customersOut}</b><span>Unique customers</span></div>
            <div className="stat"><b>{result.report.duplicatesMerged}</b><span>Duplicates merged</span></div>
            <div className="stat"><b>{result.report.rowsRejected}</b><span>Rows rejected</span></div>
            <div className="stat"><b>{result.report.invalidEmails}</b><span>Invalid emails</span></div>
          </div>

          <section className="card">
            <h2>Feedback sentiment</h2>
            {result.sentiment.total === 0 ? (
              <p className="sub">No feedback found in the uploaded data.</p>
            ) : (
              <div className="bars">
                {SENTIMENTS.map((s) => (
                  <div className="bar" key={s}>
                    <span>{s}</span>
                    <i style={{ width: `${(result.sentiment.counts[s] / maxCount) * 100}%`, background: BAR_COLOR[s] }} />
                    <b>{result.sentiment.counts[s]}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Unified customers</h2>
              <button onClick={downloadCsv}>Download CSV</button>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th>Phone</th><th>Company</th><th>City</th>
                    <th>Orders</th><th>Spend</th><th>Sentiment</th><th>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {result.customers.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name || "—"}</td>
                      <td>{c.email || "—"}</td>
                      <td>{c.phone || "—"}</td>
                      <td>{c.company || "—"}</td>
                      <td>{c.city || "—"}</td>
                      <td>{c.orders}</td>
                      <td>{c.totalSpend.toFixed(2)}</td>
                      <td>{c.sentiment ? <span className={`tag ${c.sentiment}`}>{c.sentiment}</span> : "—"}</td>
                      <td>{c.sources.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {result.report.issues.length > 0 && (
            <section className="card">
              <h2>Data quality issues</h2>
              <ul className="issues">
                {result.report.issues.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}