import { NextResponse } from "next/server";
import { analyzeSentiment } from "@/lib/sentiment";
import { summarizeSentiment } from "@/lib/etl";

export const runtime = "nodejs";

const MAX_ITEMS = 2000;
const MAX_LEN = 5000;

/** POST { "feedback": ["Great product!", "Not satisfied"] } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const feedback = (body as { feedback?: unknown } | null)?.feedback;
  if (!Array.isArray(feedback) || feedback.length === 0 || feedback.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `\`feedback\` must be an array of 1-${MAX_ITEMS} strings` },
      { status: 400 },
    );
  }
  if (!feedback.every((f) => typeof f === "string" && f.length <= MAX_LEN)) {
    return NextResponse.json({ error: `Each item must be a string up to ${MAX_LEN} chars` }, { status: 400 });
  }

  const results = (feedback as string[]).map((text) => ({ text, ...analyzeSentiment(text) }));
  return NextResponse.json({
    results,
    summary: summarizeSentiment(results),
  });
}