import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, generateMatch, generateRoundTask, scoreSubmission } from "../src/index.mjs";

const permutations = items => items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]));
const between = (s, b, a, c) => (s(b) > s(a) && s(b) < s(c)) || (s(b) < s(a) && s(b) > s(c));
const CLUES = [
  [/^(\w+) sits somewhere to the left of (\w+)\.$/, (s, a, b) => s(a) < s(b)],
  [/^(\w+) and (\w+) sit next to each other\.$/, (s, a, b) => Math.abs(s(a) - s(b)) === 1],
  [/^(\w+) and (\w+) do not sit next to each other\.$/, (s, a, b) => Math.abs(s(a) - s(b)) !== 1],
  [/^(\w+) is not in seat (\d)\.$/, (s, a, k) => s(a) !== Number(k)],
  [/^(\w+) sits in an even-numbered seat\.$/, (s, a) => s(a) % 2 === 0],
  [/^(\w+) sits in an odd-numbered seat\.$/, (s, a) => s(a) % 2 === 1],
  [/^(\w+) sits somewhere between (\w+) and (\w+)\.$/, (s, b, a, c) => between(s, b, a, c)],
  [/^(\w+) does not sit between (\w+) and (\w+)\.$/, (s, b, a, c) => !between(s, b, a, c)],
  [/^(\w+) sits at one of the two ends\.$/, (s, a) => [1, 6].includes(s(a))],
  [/^(\w+) does not sit at either end\.$/, (s, a) => ![1, 6].includes(s(a))],
  [/^Exactly (\d) (?:person sits|people sit) between (\w+) and (\w+)\.$/, (s, g, a, b) => Math.abs(s(a) - s(b)) - 1 === Number(g)],
];

test("every category is deterministic and has a concrete answer", () => {
  for (const category of CATEGORIES) for (let i = 0; i < 60; i += 1) {
    const task = generateRoundTask(`t-${i}`, category);
    assert.deepEqual(task, generateRoundTask(`t-${i}`, category));
    assert.equal(task.category, category); assert.ok(task.prompt.length > 60);
    assert.doesNotMatch(task.expected, /NaN|Infinity|undefined|^$/);
  }
});

test("logic puzzles have exactly one seating, checked by an independent solver", () => {
  for (let i = 0; i < 150; i += 1) {
    const task = generateRoundTask(`logic-${i}`, "logic");
    const names = task.prompt.split("\n")[0].split(": ")[1].replace(".", "").split(", ");
    const clues = task.prompt.split("\n").filter(line => /^\d+\. /.test(line)).map(line => line.replace(/^\d+\. /, ""));
    const tests = clues.map(clue => { for (const [pattern, check] of CLUES) { const m = clue.match(pattern); if (m) return order => check(name => order.indexOf(name) + 1, ...m.slice(1)); } throw new Error(`unparsed clue: ${clue}`); });
    const solutions = permutations(names).filter(order => tests.every(t => t(order)));
    assert.equal(solutions.length, 1, task.prompt); assert.equal(solutions[0].join(","), task.expected);
  }
});

test("a match has three rounds in three categories, honouring the requested first category", () => {
  const rounds = generateMatch("match-seed", "code");
  assert.equal(rounds.length, 3); assert.equal(rounds[0].category, "code");
  assert.equal(new Set(rounds.map(r => r.category)).size, 3);
  assert.deepEqual(rounds.map(r => r.seed), ["match-seed:r1", "match-seed:r2", "match-seed:r3"]);
});

// Runs the program text from the prompt with a true non-negative "mod", independent of the generator.
function runProgram(source) {
  const lines = source.split("\n").filter(line => line.trim()); const out = []; const stack = [];
  for (const line of lines) {
    const indent = line.match(/^ */)[0].length; const code = line.trim();
    while (stack.length && indent <= stack.at(-1)) { stack.pop(); out.push("}"); }
    const expr = text => text.replace(/(\([^()]*\)|[\w]+)\s+mod\s+(\w+)/g, "M($1,$2)");
    let m;
    if ((m = code.match(/^for (\w+) in (\d+)\.\.(\d+):$/))) { out.push(`for(let ${m[1]}=${m[2]};${m[1]}<=${m[3]};${m[1]}++){`); stack.push(indent); }
    else if ((m = code.match(/^if (.+):$/))) { out.push(`if(${expr(m[1])}){`); stack.push(indent); }
    else if (code === "else:") { out.push("else{"); stack.push(indent); }
    else if ((m = code.match(/^print\((.+)\)$/))) out.push(`result=${expr(m[1])};`);
    else if ((m = code.match(/^(\w+) = (.+)$/))) out.push(`${m[1]}=${expr(m[2])};`);
    else throw new Error(`unparsed line: ${code}`);
  }
  while (stack.pop() !== undefined) out.push("}");
  return String(new Function("M", `let a,b,c,d,result;${out.join("\n")};return result;`)((x, n) => ((x % n) + n) % n));
}

test("code tasks: the printed program, run with a true mod, gives the expected answer", () => {
  for (let i = 0; i < 400; i += 1) {
    const task = generateRoundTask(`code-${i}`, "code");
    assert.equal(runProgram(task.payload.program), task.expected, task.prompt);
  }
});

test("memory tasks: solving the dossier text (with relocations) gives the expected answer", () => {
  for (let i = 0; i < 300; i += 1) {
    const task = generateRoundTask(`memory-${i}`, "memory");
    const home = {}, partner = {}, vault = {};
    for (const line of task.prompt.split("\n")) {
      let m;
      if ((m = line.match(/^(\w+) lives in (\w+)\.$/))) home[m[1]] = m[2];
      else if ((m = line.match(/^(\w+)'s partner is (\w+)\.$/))) partner[m[1]] = m[2];
      else if ((m = line.match(/^The vault code of (\w+) is (\d+)\.$/))) vault[m[1]] = Number(m[2]);
    }
    for (const [, agent, city] of task.prompt.matchAll(/^Later, (\w+) moved to (\w+)\.$/gm)) home[agent] = city;
    const start = task.prompt.match(/Start with (\w+)\./)[1];
    const city = home[partner[partner[start]]];
    assert.equal(String(vault[city] + Object.values(home).filter(c => c === city).length), task.expected, task.prompt.slice(-300));
  }
});

test("planning tasks: scheduling the listed tasks gives the expected finish day", () => {
  for (let i = 0; i < 300; i += 1) {
    const task = generateRoundTask(`planning-${i}`, "planning");
    const finish = {};
    for (const line of task.prompt.split("\n").filter(l => /^[A-L]: \d+ days/.test(l))) {
      const [id, rest] = line.split(": "); const duration = Number(rest.match(/^(\d+) days/)[1]);
      let start = 0;
      for (const [, dep] of rest.matchAll(/(?:^|, )after ([A-L])/g)) start = Math.max(start, finish[dep]);
      for (const [, lag, dep] of rest.matchAll(/starts at least (\d+) days? after ([A-L]) finishes/g)) start = Math.max(start, finish[dep] + Number(lag));
      const release = rest.match(/not before day (\d+)/); if (release) start = Math.max(start, Number(release[1]));
      finish[id] = start + duration;
    }
    assert.equal(String(Math.max(...Object.values(finish))), task.expected, task.prompt);
  }
});


test("scoring: 70 accuracy, 20 speed, 10 efficiency per round", () => {
  const task = { ...generateRoundTask("score", "math"), maxDurationMs: 90_000, unitBudget: 3000 };
  const perfect = scoreSubmission(task, { answer: task.expected, latencyMs: 0, units: 40 });
  assert.deepEqual([perfect.total, perfect.accuracy, perfect.speed, perfect.efficiency, perfect.exact], [100, 70, 20, 10, true]);
  assert.equal(scoreSubmission(task, { answer: "", latencyMs: 90_000, units: 9000 }).total, 0);
});

test("an empty answer earns no near-miss credit", () => {
  const task = { category: "math", expected: "6", maxDurationMs: 90_000, unitBudget: 3000 };
  assert.equal(scoreSubmission(task, { answer: "", latencyMs: 90_000, units: 3000 }).total, 0);
  assert.equal(scoreSubmission(task, { answer: "7", latencyMs: 90_000, units: 3000 }).accuracy, 26);
});
