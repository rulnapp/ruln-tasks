// RULN arena tasks: deterministic generation from a seed, verification and scoring.
// This is the same code the arena runs; any match can be reproduced from its seed.
import { createHash } from "node:crypto";

const sha256 = value => createHash("sha256").update(String(value)).digest();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Arena tasks v2: multi-step problems with exactly one verifiable answer, generated from a seed.
// Every generator returns { category, kind, prompt, expected, payload }.

export const CATEGORIES = ["logic", "code", "math", "planning", "pattern", "memory", "optimization"];

function rng(seed) {
  let counter = 0;
  const next = () => sha256(`${seed}:${counter++}`).readUInt32BE(0) / 2 ** 32;
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = list => list[Math.floor(next() * list.length)];
  const shuffle = list => { const copy = [...list]; for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(next() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
  return { next, int, pick, shuffle };
}

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]));
}

// LOGIC — seat five people from clues; the clue set is grown until exactly one seating remains.
function logicTask(r) {
  for (;;) { const task = logicAttempt(r); if (task) return task; }
}
function logicAttempt(r) {
  const names = r.shuffle(["AVA", "BEN", "CLEO", "DAX", "EVE", "FINN", "GUS", "IVY", "JUNO", "KAI"]).slice(0, 6); const last = names.length;
  const solution = r.shuffle(names);
  const seat = (order, name) => order.indexOf(name) + 1;
  const makers = [
    () => { const [a, b] = r.shuffle(names).slice(0, 2); const [x, y] = seat(solution, a) < seat(solution, b) ? [a, b] : [b, a]; return { text: `${x} sits somewhere to the left of ${y}.`, test: o => seat(o, x) < seat(o, y) }; },
    () => { const [a, b] = r.shuffle(names).slice(0, 2); const adj = Math.abs(seat(solution, a) - seat(solution, b)) === 1; return { text: adj ? `${a} and ${b} sit next to each other.` : `${a} and ${b} do not sit next to each other.`, test: o => (Math.abs(seat(o, a) - seat(o, b)) === 1) === adj }; },
    () => { const a = r.pick(names); const s = seat(solution, a); const k = r.pick([1, 2, 3, 4, 5, 6].filter(v => v !== s)); return { text: `${a} is not in seat ${k}.`, test: o => seat(o, a) !== k }; },
    () => { const a = r.pick(names); const even = seat(solution, a) % 2 === 0; return { text: `${a} sits in an ${even ? "even" : "odd"}-numbered seat.`, test: o => (seat(o, a) % 2 === 0) === even }; },
    () => { const [a, b, c] = r.shuffle(names).slice(0, 3); const [sa, sb, sc] = [a, b, c].map(n => seat(solution, n)); const between = (sb > sa && sb < sc) || (sb < sa && sb > sc); return { text: between ? `${b} sits somewhere between ${a} and ${c}.` : `${b} does not sit between ${a} and ${c}.`, test: o => { const [x, y, z] = [a, b, c].map(n => seat(o, n)); return ((y > x && y < z) || (y < x && y > z)) === between; } }; },
    () => { const a = r.pick(names); const end = [1, last].includes(seat(solution, a)); return { text: end ? `${a} sits at one of the two ends.` : `${a} does not sit at either end.`, test: o => [1, last].includes(seat(o, a)) === end }; },
    () => { const [a, b] = r.shuffle(names).slice(0, 2); const gap = Math.abs(seat(solution, a) - seat(solution, b)) - 1; return gap >= 1 ? { text: `Exactly ${gap} ${gap === 1 ? "person sits" : "people sit"} between ${a} and ${b}.`, test: o => Math.abs(seat(o, a) - seat(o, b)) - 1 === gap } : null; },
  ];
  let candidates = permutations(names); const clues = [];
  for (let guard = 0; candidates.length > 1 && guard < 400; guard += 1) {
    const clue = r.pick(makers)();
    if (!clue || clues.some(c => c.text === clue.text)) continue;
    const remaining = candidates.filter(clue.test);
    if (remaining.length === candidates.length && clues.length < 14) continue;
    clues.push(clue); candidates = remaining;
  }
  if (candidates.length !== 1 || candidates[0].join() !== solution.join()) return null;
  const prompt = [`Six people sit in a row of seats numbered 1 to 6 from left to right: ${[...names].sort().join(", ")}.`, "", ...r.shuffle(clues).map((c, i) => `${i + 1}. ${c.text}`), "", "List the people from seat 1 to seat 6, comma-separated."].join("\n");
  return { category: "logic", kind: "seating", prompt, expected: solution.join(","), payload: { names, clues: clues.length } };
}

// CODE — trace a small program with a loop and a branch.
function codeTask(r) {
  const a0 = r.int(2, 9), b0 = r.int(10, 30), d0 = r.int(1, 4), loops = r.int(9, 13), k = r.int(2, 5), m = r.pick([17, 19, 23, 29, 31]), w = r.int(5, 9), t = r.pick([3, 4]);
  const mod = (x, n) => ((x % n) + n) % n; // the prompt promises a non-negative remainder; JS % is not
  let a = a0, b = b0, c = 0, d = d0;
  for (let i = 1; i <= loops; i += 1) {
    a = mod(a * k + i, m);
    if (a > mod(b, m)) { b = b + mod(a, w); c = c + i; } else { b = b - d; c = c - a; }
    if (mod(i, t) === 0) d = d + 1;
  }
  const program = [`a = ${a0}`, `b = ${b0}`, `c = 0`, `d = ${d0}`, `for i in 1..${loops}:`, `    a = (a * ${k} + i) mod ${m}`, `    if a > (b mod ${m}):`, `        b = b + (a mod ${w})`, `        c = c + i`, `    else:`, `        b = b - d`, `        c = c - a`, `    if i mod ${t} == 0:`, `        d = d + 1`, `print(c + b * d)`].join("\n");
  return { category: "code", kind: "trace", prompt: `Run this program by hand. "mod" is the non-negative remainder; values can go negative.\n\n${program}\n\nWhat does it print?`, expected: String(c + b * d), payload: { program } };
}

// MATH — count integers that satisfy three conditions at once.
function mathTask(r) {
  const gcd = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
  let a, b; do { a = r.int(3, 9); b = r.int(4, 11); } while (a === b || gcd(a, b) !== 1);
  const ra = r.int(0, a - 1), rb = r.int(0, b - 1), m = r.pick([4, 5, 6, 7, 8, 9, 10, 12, 15].filter(v => v !== a && v !== b)), n = r.int(300, 900);
  let count = 0;
  for (let v = 1; v <= n; v += 1) if (v % a === ra && v % b === rb && v % m !== 0) count += 1;
  return { category: "math", kind: "count", prompt: `How many integers n with 1 ≤ n ≤ ${n} satisfy all three conditions?\n\n1. n leaves remainder ${ra} when divided by ${a}.\n2. n leaves remainder ${rb} when divided by ${b}.\n3. n is not divisible by ${m}.`, expected: String(count), payload: { n, a, ra, b, rb, m } };
}

// PLANNING — earliest finish of a project with dependencies and release times (unlimited workers).
function planningTask(r) {
  const ids = "ABCDEFGHIJKL".split("").slice(0, r.int(10, 12));
  const tasks = ids.map((id, i) => {
    const deps = i === 0 ? [] : r.shuffle(ids.slice(0, i)).slice(0, r.int(i < 2 ? 0 : 1, Math.min(3, i))).sort().map(dep => ({ id: dep, lag: r.next() < .3 ? r.int(1, 4) : 0 }));
    return { id, duration: r.int(2, 9), deps, release: 0 };
  });
  for (const task of r.shuffle(tasks.slice(1)).slice(0, 3)) task.release = r.int(5, 18);
  const finish = {};
  for (const task of tasks) finish[task.id] = Math.max(task.release, ...task.deps.map(dep => finish[dep.id] + dep.lag), 0) + task.duration;
  const describe = t => [`${t.id}: ${t.duration} days`, ...t.deps.map(dep => dep.lag ? `starts at least ${dep.lag} day${dep.lag === 1 ? "" : "s"} after ${dep.id} finishes` : `after ${dep.id}`), ...(t.release ? [`not before day ${t.release}`] : [])].join(", ");
  return { category: "planning", kind: "schedule", prompt: `A project starts on day 0. Any number of tasks can run at the same time. A task starts as soon as every condition listed for it is met.\n\n${tasks.map(describe).join("\n")}\n\nOn which day is the whole project finished?`, expected: String(Math.max(...Object.values(finish))), payload: { tasks } };
}

// PATTERN — sequences with a compound rule; give the next two terms.
function patternTask(r) {
  const digitSum = v => String(Math.abs(v)).split("").reduce((sum, ch) => sum + Number(ch), 0);
  const families = [
    () => { const m = r.int(2, 3), c = r.int(-4, 5), s = r.int(1, 4); const seq = [s]; while (seq.length < 9) seq.push(seq.at(-1) * m + c * (seq.length % 2 ? 1 : -1)); return seq; },
    () => { const a = r.int(2, 9), d = r.int(3, 7), g = r.int(1, 3), q = r.int(2, 3); const seq = []; for (let i = 0; i < 9; i += 1) seq.push(i % 2 === 0 ? a + d * (i / 2) : g * q ** ((i - 1) / 2)); return seq; },
    () => { const a = r.int(1, 4), b = r.int(-3, 5), c = r.int(1, 9), e = r.int(2, 6); return Array.from({ length: 9 }, (_, i) => a * i * i + b * i + c + (i % 2 ? e : -e)); },
    () => { const x = r.int(1, 4), y = r.int(2, 5), k = r.int(2, 3); const seq = [x, y]; while (seq.length < 9) seq.push(seq.at(-1) + k * seq.at(-2)); return seq; },
    () => { const s = r.int(11, 60); const seq = [s]; while (seq.length < 9) seq.push(seq.at(-1) + digitSum(seq.at(-1))); return seq; },
    () => { const s = r.int(1, 9), k = r.int(1, 3); const seq = [s]; while (seq.length < 9) seq.push(seq.at(-1) + seq.length ** 2 * k); return seq; },
    () => { const s = r.int(2, 9), add = r.int(2, 6), mul = r.int(2, 3), sub = r.int(3, 9); const ops = [v => v + add, v => v * mul, v => v - sub]; const seq = [s]; while (seq.length < 9) seq.push(ops[(seq.length - 1) % 3](seq.at(-1))); return seq; },
  ];
  const seq = r.pick(families)();
  return { category: "pattern", kind: "sequence", prompt: `Find the rule and continue the sequence:\n\n${seq.slice(0, 7).join(", ")}, ?, ?\n\nGive the next two terms, comma-separated.`, expected: `${seq[7]},${seq[8]}`, payload: { shown: seq.slice(0, 7) } };
}

// MEMORY — a dossier with three hops and a count.
function memoryTask(r) {
  const agents = r.shuffle(["ORCA", "VIPER", "LYNX", "RAVEN", "COBRA", "FALCON", "MANTIS", "OTTER", "PUMA", "SHARK", "TIGER", "WOLF", "HERON", "BISON", "GECKO", "KOALA", "MOOSE", "PANDA", "QUAIL", "ZEBRA", "EAGLE", "HYENA", "IBIS", "JACKAL", "MARTEN", "NEWT", "OWL", "RHINO", "STOAT", "TAPIR"]);
  const cities = r.shuffle(["OSLO", "LIMA", "ROME", "KYIV", "BERN", "DOHA", "RIGA", "SUVA", "NUUK", "BAKU"]);
  const firstHome = Object.fromEntries(agents.map(a => [a, r.pick(cities)]));
  const vault = Object.fromEntries(cities.map(c => [c, r.int(110, 989)]));
  const partner = Object.fromEntries(agents.map((a, i) => [a, agents[(i + r.int(1, agents.length - 1)) % agents.length]]));
  const start = r.pick(agents); const first = partner[start]; const second = partner[first];
  // Relocations override the original address; the target agent usually moves to test careful reading.
  const movers = r.shuffle(agents.filter(a => a !== second)).slice(0, 5); if (r.next() < .7) movers[0] = second;
  const home = { ...firstHome }; const moves = [];
  for (const agent of movers) { const to = r.pick(cities.filter(c => c !== home[agent])); moves.push(`Later, ${agent} moved to ${to}.`); home[agent] = to; }
  const city = home[second]; const residents = agents.filter(a => home[a] === city).length;
  const facts = r.shuffle([...agents.map(a => `${a} lives in ${firstHome[a]}.`), ...agents.map(a => `${a}'s partner is ${partner[a]}.`), ...cities.map(c => `The vault code of ${c} is ${vault[c]}.`)]);
  return { category: "memory", kind: "dossier", prompt: `Dossier:\n${facts.join("\n")}\n\nUpdates (they replace older facts):\n${moves.join("\n")}\n\nStart with ${start}. Take ${start}'s partner, then that agent's partner. Find the city this second partner lives in now. Add that city's vault code to the number of agents who live in that city now. What is the result?`, expected: String(vault[city] + residents), payload: { start, first, second, city } };
}

// OPTIMIZATION — 0/1 knapsack or a shortest path in a weighted graph.
function optimizationTask(r) {
  if (r.next() < .5) {
    const items = Array.from({ length: r.int(11, 12) }, (_, i) => ({ name: `I${i + 1}`, weight: r.int(2, 12), value: r.int(4, 30) }));
    const capacity = Math.floor(items.reduce((s, it) => s + it.weight, 0) * (.35 + r.next() * .15));
    const best = Array(capacity + 1).fill(0);
    for (const it of items) for (let w = capacity; w >= it.weight; w -= 1) best[w] = Math.max(best[w], best[w - it.weight] + it.value);
    return { category: "optimization", kind: "knapsack", prompt: `Choose items for a bag with capacity ${capacity}. Each item can be taken at most once.\n\n${items.map(it => `${it.name}: weight ${it.weight}, value ${it.value}`).join("\n")}\n\nWhat is the maximum total value that fits?`, expected: String(best[capacity]), payload: { capacity, items } };
  }
  const nodes = "ABCDEFGHIJKL".split("").slice(0, r.int(11, 12)); const edges = new Map();
  const key = (a, b) => [a, b].sort().join("");
  for (let i = 1; i < nodes.length; i += 1) edges.set(key(nodes[i], nodes[r.int(0, i - 1)]), r.int(2, 15));
  while (edges.size < nodes.length + 8) { const [a, b] = r.shuffle(nodes).slice(0, 2); if (!edges.has(key(a, b))) edges.set(key(a, b), r.int(2, 15)); }
  const from = nodes[0], to = nodes.at(-1); const dist = Object.fromEntries(nodes.map(n => [n, Infinity])); dist[from] = 0; const done = new Set();
  while (done.size < nodes.length) {
    const u = nodes.filter(n => !done.has(n)).sort((x, y) => dist[x] - dist[y])[0]; done.add(u);
    for (const [pair, w] of edges) if (pair.includes(u)) { const v = pair[0] === u ? pair[1] : pair[0]; dist[v] = Math.min(dist[v], dist[u] + w); }
  }
  const list = r.shuffle([...edges].map(([pair, w]) => `${pair[0]} — ${pair[1]}: ${w}`));
  return { category: "optimization", kind: "shortest-path", prompt: `Roads between towns (two-way, with lengths):\n\n${list.join("\n")}\n\nWhat is the length of the shortest route from ${from} to ${to}?`, expected: String(dist[to]), payload: { from, to } };
}

const GENERATORS = { logic: logicTask, code: codeTask, math: mathTask, planning: planningTask, pattern: patternTask, memory: memoryTask, optimization: optimizationTask };

export function generateRoundTask(seed, category) {
  const r = rng(seed);
  const chosen = CATEGORIES.includes(category) ? category : r.pick(CATEGORIES);
  return { seed, ...GENERATORS[chosen](r) };
}

// A match: three rounds in three different categories, all derived from the match seed.
export function generateMatch(seed, firstCategory, { rounds = 3 } = {}) {
  const r = rng(`${seed}:categories`);
  const order = r.shuffle(CATEGORIES.filter(c => c !== firstCategory));
  const categories = (CATEGORIES.includes(firstCategory) ? [firstCategory, ...order] : order).slice(0, rounds);
  return categories.map((category, i) => generateRoundTask(`${seed}:r${i + 1}`, category));
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

