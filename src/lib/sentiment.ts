import type { Sentiment, SentimentResult } from "./types";

/**
 * A small, dependency-free, rule-based sentiment analyzer (lexicon + negation
 * + intensifiers). It runs anywhere (including Vercel serverless/edge) with no
 * model downloads. Swap in a hosted model or API if you need more accuracy.
 */

const LEXICON = new Map<string, number>(
  Object.entries({
    // positive
    great: 0.8, excellent: 1, amazing: 0.9, awesome: 0.9, fantastic: 0.9,
    wonderful: 0.9, love: 0.7, loved: 0.7, perfect: 1, good: 0.6, nice: 0.5,
    happy: 0.8, satisfied: 0.5, pleased: 0.6, helpful: 0.5, friendly: 0.5,
    fast: 0.4, quick: 0.4, easy: 0.4, smooth: 0.4, reliable: 0.5,
    recommend: 0.5, best: 0.9, brilliant: 0.9, superb: 0.9, delighted: 0.9,
    impressed: 0.7, outstanding: 1, fine: 0.3, decent: 0.3, comfortable: 0.4,
    useful: 0.5, valuable: 0.5, responsive: 0.5, polite: 0.4, thanks: 0.3,
    thank: 0.3, enjoy: 0.6, enjoyed: 0.6,
    // negative
    bad: -0.7, terrible: -1, awful: -1, horrible: -1, worst: -1, poor: -0.6,
    disappointed: -0.7, disappointing: -0.7, unhappy: -0.7, angry: -0.8,
    slow: -0.4, broken: -0.7, useless: -0.8, hate: -0.8, hated: -0.8,
    rude: -0.7, late: -0.4, delayed: -0.5, expensive: -0.3, overpriced: -0.5,
    buggy: -0.6, confusing: -0.5, difficult: -0.4, frustrating: -0.7,
    frustrated: -0.7, unreliable: -0.6, defective: -0.8, faulty: -0.7,
    refund: -0.4, complaint: -0.5, issue: -0.3, problem: -0.4, problems: -0.4,
    waste: -0.6, annoying: -0.6, unacceptable: -0.8, mediocre: -0.3,
    lacking: -0.4, unresponsive: -0.6, damaged: -0.7, cancel: -0.4,
    cancelled: -0.4,
  }),
);

const NEGATORS = new Set([
  "not", "no", "never", "cannot", "cant", "can't", "dont", "don't", "didnt",
  "didn't", "isnt", "isn't", "wasnt", "wasn't", "wont", "won't", "doesnt",
  "doesn't", "hardly", "barely", "without",
]);

const MODIFIERS = new Map<string, number>(
  Object.entries({
    very: 1.4, really: 1.3, extremely: 1.6, super: 1.4, so: 1.2, highly: 1.3,
    absolutely: 1.5, totally: 1.3, quite: 1.1,
    slightly: 0.5, somewhat: 0.6, bit: 0.6, little: 0.6, fairly: 0.8, kinda: 0.6,
  }),
);

const NEUTRAL_BAND = 0.05;

export function labelFor(polarity: number): Sentiment {
  if (polarity > NEUTRAL_BAND) return "Positive";
  if (polarity < -NEUTRAL_BAND) return "Negative";
  return "Neutral";
}

export function analyzeSentiment(text: string): SentimentResult {
  const tokens = text.toLowerCase().replace(/[\u2019]/g, "'").match(/[a-z']+/g) ?? [];
  const scores: number[] = [];

  tokens.forEach((token, i) => {
    const base = LEXICON.get(token);
    if (base === undefined) return;

    let score = base;
    const modifier = MODIFIERS.get(tokens[i - 1] ?? "") ?? MODIFIERS.get(tokens[i - 2] ?? "");
    if (modifier !== undefined) score *= modifier;

    const windowStart = Math.max(0, i - 3);
    const negated = tokens.slice(windowStart, i).some((t) => NEGATORS.has(t));
    if (negated) score *= -0.75;

    scores.push(Math.max(-1, Math.min(1, score)));
  });

  if (scores.length === 0) return { label: "Neutral", polarity: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const polarity = Math.round(mean * 1000) / 1000;
  return { label: labelFor(polarity), polarity };
}