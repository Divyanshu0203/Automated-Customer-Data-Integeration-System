# Automated Customer Data Integration

A web app that merges customer data from multiple sources into one clean profile per customer, and scores customer feedback for sentiment. Upload files or paste data, and it will clean it, remove duplicates, and give you a unified customer list you can download as CSV.

Built with Next.js, TypeScript, and deployable on Vercel with zero configuration.

**Live demo:** _add your Vercel URL here_


## Features

- **Multiple input formats:** CSV, TSV, TXT, JSON (including nested objects), NDJSON/JSONL, XML, and Excel (`.xlsx`), or paste data straight into the app.
- **Smart column matching:** headers like `Email Address`, `e-mail`, `Mobile` or `Signup Date` are mapped automatically.
- **Data cleaning:** trims whitespace, fixes name casing, validates emails, normalizes phone numbers, and parses dates and currency amounts.
- **Deduplication across sources:** records that share an email **or** a phone number are merged into one customer, even when they come from different files.
- **Sentiment analysis:** customer feedback is labelled Positive, Neutral or Negative using a built-in rule-based analyzer that understands negation ("not satisfied") and intensifiers ("very helpful").
- **Data quality report:** rows read, duplicates merged, rows rejected, invalid emails, and a list of specific issues found.
- **CSV export** of the merged customers.
- **REST API** for use from other tools.

## How it works

1. **Extract:** each file is parsed according to its format and its columns are mapped onto standard fields (name, email, phone, company, city, country, date, amount, feedback).
2. **Transform:** every value is cleaned and validated. Rows with no valid email and no valid phone are rejected and reported.
3. **Merge:** rows are grouped by shared email or phone number (using a union-find algorithm), so a phone-only order and an email-only feedback entry can end up on the same customer.
4. **Analyze:** feedback is scored and rolled up per customer and overall.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) and [React](https://react.dev/)
- TypeScript
- [read-excel-file](https://www.npmjs.com/package/read-excel-file) for `.xlsx` support
- No database and no external APIs

## Getting started

**Requirements:** Node.js 20.9 or newer.

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Load sample data** to try it without your own files.

| Command         | What it does                  |
| --------------- | ----------------------------- |
| `npm run dev`   | Start the development server  |
| `npm run build` | Create a production build     |
| `npm start`     | Run the production build      |

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Keep the default settings (Next.js is detected automatically) and click **Deploy**.

No environment variables are required.

## Supported formats

| Format | Extensions | Notes |
| --- | --- | --- |
| Delimited text | `.csv` `.tsv` `.txt` | Comma, semicolon, tab or pipe delimiter is auto-detected |
| JSON | `.json` | Array of objects, or an object containing `data`, `records`, `customers`, `items` or `rows`. Nested fields are flattened (`address.city` becomes `city`) |
| NDJSON | `.ndjson` `.jsonl` | One JSON object per line |
| XML | `.xml` | The repeated element (e.g. `<customer>`) is detected automatically. Attributes and nested elements are supported |
| Excel | `.xlsx` | First sheet only. Old `.xls` files must be saved as `.xlsx` or `.csv` |
| Pasted text | n/a | Format is detected from the content |

## API

All endpoints accept and return JSON.

### `POST /api/integrate`

```json
{
  "datasets": [
    { "name": "crm.csv", "content": "name,email\nAda,ada@example.com" },
    { "name": "feedback.json", "content": "[{\"email\":\"ada@example.com\",\"feedback\":\"Great service!\"}]" }
  ]
}
```

Returns `{ customers, report, sentiment }`. Add `?format=csv` to the URL to download the merged customers as a CSV file instead.

Each dataset may include an optional `"format"` (`csv`, `json`, `ndjson` or `xml`). If omitted, it is detected from the file name or content.

### `POST /api/sentiment`

```json
{ "feedback": ["Great product!", "Not satisfied", "Okay experience"] }
```

Returns a `label` and `polarity` (-1 to 1) for each item, plus a summary.

### `GET /api/health`

Returns `{ "status": "ok" }`.

## Project structure

```
src/
├── app/
│   ├── page.tsx               # Dashboard UI
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── integrate/route.ts # Clean + merge endpoint
│       ├── sentiment/route.ts # Sentiment endpoint
│       └── health/route.ts    # Health check
└── lib/
    ├── etl.ts                 # Extract, clean, merge
    ├── csv.ts                 # CSV parser and writer
    ├── xml.ts                 # XML reader
    ├── flatten.ts             # Nested JSON flattening
    ├── sentiment.ts           # Sentiment analyzer
    ├── sample.ts              # Demo data
    └── types.ts               # Shared types
```

## Customizing

- **Recognize more column names:** add the lowercase, space-free name to the `alias(...)` lines near the top of `src/lib/etl.ts`. For example, add `"clientmail"` to the `email` list.
- **Better sentiment accuracy:** the analyzer in `src/lib/sentiment.ts` is rule-based, fast and dependency-free. You can replace `analyzeSentiment()` with a call to a hosted model or API without changing anything else.

## Limitations

- **No data is stored.** Everything is processed per request and discarded. Add a database (for example Vercel Postgres or Supabase) if you need persistence.
- **Upload size is limited to about 4 MB per request**, because of Vercel's serverless body limit.
- **Sentiment analysis is rule-based**, so it is less accurate than a trained model, especially for sarcasm and non-English text.
- The XML reader is lightweight and may not handle very unusual XML.
- Day-first dates (`DD/MM/YYYY`) are assumed for ambiguous formats.

## License

MIT. See [LICENSE](LICENSE) for details.