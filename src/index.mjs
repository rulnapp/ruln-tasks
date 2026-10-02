import { createHash } from "node:crypto";

// RULN arena tasks: deterministic generation from a seed, verification and scoring.
// This is the same code the arena runs; any match can be reproduced from its seed.

const sha256 = value => createHash("sha256").update(String(value)).digest();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const CATEGORIES = ["logic", "code", "math", "planning", "pattern", "memory", "optimization"];

function uint(seed, index = 0) {
  return sha256(`${seed}:${index}`).readUInt32BE(0);
}
const pick = (seed, index, min, max) => min + (uint(seed, index) % (max - min + 1));

function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a; }
function minCoins(target, coins) {
  const dp = Array(target + 1).fill(Infinity); dp[0] = 0;
  for (let i = 1; i <= target; i += 1) for (const coin of coins) if (coin <= i) dp[i] = Math.min(dp[i], dp[i - coin] + 1);
  return dp[target];
}

export function generateTask(seed, requestedCategory) {
  const category = CATEGORIES.includes(requestedCategory) ? requestedCategory : CATEGORIES[uint(seed) % CATEGORIES.length];
  let prompt; let expected; let payload;
  if (category === "logic") {
    const a = pick(seed, 1, 3, 14), b = pick(seed, 2, 4, 12), c = pick(seed, 3, 2, 19);
    prompt = `Evaluate (${a} × ${b}) + ${c}. Return only the integer.`; expected = String(a * b + c); payload = { a, b, c };
  } else if (category === "code") {
    const values = Array.from({ length: 5 }, (_, i) => pick(seed, i + 2, 1, 9));
    prompt = `A program maps x => x*x, keeps even results, then sums them. Input: [${values.join(", ")}]. Return only the sum.`;
    expected = String(values.map(x => x * x).filter(x => x % 2 === 0).reduce((a, b) => a + b, 0)); payload = { values };
  } else if (category === "math") {
    const a = pick(seed, 1, 24, 96), b = pick(seed, 2, 18, 84);
    prompt = `Find gcd(${a}, ${b}). Return only the integer.`; expected = String(gcd(a, b)); payload = { a, b };
  } else if (category === "planning") {
    const plans = [["RESEARCH", "SPEC", "BUILD", "TEST"], ["SCOPE", "DESIGN", "IMPLEMENT", "VERIFY"], ["INPUT", "PARSE", "PROCESS", "OUTPUT"]];
    const order = plans[uint(seed, 1) % plans.length];
    prompt = `Order these dependent steps from first to last: ${[...order].sort((a, b) => uint(seed + a) - uint(seed + b)).join(", ")}. Return comma-separated labels.`;
    expected = order.join(","); payload = { order };
  } else if (category === "pattern") {
    const start = pick(seed, 1, 2, 11), step = pick(seed, 2, 2, 8); const sequence = Array.from({ length: 5 }, (_, i) => start + step * i);
    prompt = `Continue the sequence ${sequence.join(", ")}. Return only the next integer.`; expected = String(start + step * 5); payload = { sequence };
  } else if (category === "memory") {
    const tokens = Array.from({ length: 6 }, (_, i) => String.fromCharCode(65 + (uint(seed, i + 1) % 26)));
    prompt = `Memorize and reverse this sequence: ${tokens.join("-")}. Return the reversed sequence using hyphens.`; expected = [...tokens].reverse().join("-"); payload = { tokens };
  } else {
    const coins = [1, pick(seed, 2, 3, 5), pick(seed, 3, 7, 10)].sort((a, b) => a - b); const target = pick(seed, 4, 18, 38);
    prompt = `Using unlimited coins [${coins.join(", ")}], find the minimum number needed to total ${target}. Return only the integer.`;
    expected = String(minCoins(target, coins)); payload = { coins, target };
  }
  return { seed, category, prompt, expected, payload, maxDurationMs: 15_000 };
}

function normalized(value) { return String(value ?? "").trim().toUpperCase().replace(/\s+/g, ""); }

export function scoreSubmission(task, submission) {
  const exact = normalized(submission.answer) === normalized(task.expected);
  let accuracy = exact ? 70 : 0;
  if (!exact && Number.isFinite(Number(submission.answer)) && Number.isFinite(Number(task.expected))) {
    const delta = Math.abs(Number(submission.answer) - Number(task.expected));
    accuracy = clamp(Math.round(30 - delta * 4), 0, 30);
  }
  const speed = clamp(Math.round(20 * (1 - submission.latencyMs / task.maxDurationMs)), 0, 20);
  const efficiency = clamp(Math.round(10 * (1 - Math.max(0, submission.units - 40) / (task.unitBudget || 250))), 0, 10);
  return { total: accuracy + speed + efficiency, accuracy, speed, efficiency, exact, answer: String(submission.answer), latencyMs: submission.latencyMs, units: submission.units, provider: submission.provider, ...(submission.model ? { model: submission.model } : {}), ...(submission.tier ? { tier: submission.tier } : {}), ...(submission.reply ? { reply: submission.reply } : {}), ...(submission.reasoning ? { reasoning: submission.reasoning } : {}), ...(submission.log?.length ? { log: submission.log } : {}) };
}

export function eloChange(challengerRating, kingRating, challengerWon) {
  const expected = 1 / (1 + 10 ** ((kingRating - challengerRating) / 400));
  const delta = Math.round(24 * ((challengerWon ? 1 : 0) - expected));
  return { challenger: delta, king: -delta };
}

