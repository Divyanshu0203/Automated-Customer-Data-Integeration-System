import test from "node:test";
import assert from "node:assert/strict";
import { integrate } from "../src/lib/etl";
import { parseCsv, toCsv } from "../src/lib/csv";
import { analyzeSentiment } from "../src/lib/sentiment";
import { SAMPLE_DATASETS } from "../src/lib/sample";

test("csv parser handles quotes, commas, CRLF and BOM", () => {
  const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("csv export neutralizes formula injection but keeps phone numbers", () => {
  const out = toCsv([{ a: "=SUM(A1)", b: "+919876543210" }], ["a", "b"]);
  assert.equal(out, "a,b\n'=SUM(A1),+919876543210\n");
});

test("sentiment: positive, negative, negation, neutral", () => {
  assert.equal(analyzeSentiment("Great product!").label, "Positive");
  assert.equal(analyzeSentiment("Not satisfied").label, "Negative");
  assert.equal(analyzeSentiment("Okay experience").label, "Neutral");
  assert.equal(analyzeSentiment("not bad at all").label, "Positive");
  assert.equal(analyzeSentiment("constructor toString").label, "Neutral");
});

test("sample data merges across email and phone, cleans values", () => {
  const { customers, report, sentiment } = integrate(SAMPLE_DATASETS);

  assert.equal(report.rowsRejected, 1);
  assert.equal(report.invalidEmails, 1);
  assert.equal(report.customersOut, 6);
  assert.equal(report.duplicatesMerged, 16 - 6);

  const priya = customers.find((c) => c.email === "priya.sharma@example.com");
  assert.ok(priya);
  assert.equal(priya.name, "Priya Sharma");
  assert.equal(priya.city, "Gurugram");
  assert.equal(priya.createdAt, "2024-03-15");
  assert.equal(priya.orders, 2);
  assert.equal(priya.totalSpend, 2099.5);
  assert.equal(priya.sentiment, "Positive");

  const anita = customers.find((c) => c.name === "Anita Desai");
  assert.ok(anita);
  assert.equal(anita.email, "");
  assert.equal(anita.sentiment, "Negative");

  assert.equal(customers.find((c) => c.email === "rahul.verma@example.com")?.name, "Rahul Verma");
  assert.equal(integrate([{ name: "a.csv", content: "name,email\nron McDonald,r@x.io\n" }]).customers[0].name, "Ron McDonald");

  const john = customers.find((c) => c.email === "john.smith@example.com");
  assert.equal(john?.totalSpend, 224.99);

  assert.equal(sentiment.total, 5);
});

test("bad input is reported, not thrown", () => {
  const { report, customers } = integrate([{ name: "broken.json", content: "{nope" }]);
  assert.equal(customers.length, 0);
  assert.match(report.issues[0], /broken\.json/);
});