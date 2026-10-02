#!/usr/bin/env node
import { CATEGORIES, generateMatch, generateRoundTask, scoreSubmission } from "../src/index.mjs";

const [command, ...args] = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const positional = args.filter((value, i) => !value.startsWith("--") && !args[i - 1]?.startsWith("--"));
const open = (task, withAnswer) => { const { payload, expected, ...rest } = task; return withAnswer ? { ...rest, expected } : rest; };

if (command === "match" && positional[0]) {
  const rounds = generateMatch(positional[0], positional[1]);
  console.log(JSON.stringify(rounds.map(task => open(task, args.includes("--answer"))), null, 2));
} else if (command === "task" && positional[0]) {
  console.log(JSON.stringify(open(generateRoundTask(positional[0], positional[1]), args.includes("--answer")), null, 2));
} else if (command === "score" && positional.length >= 5) {
  const [seed, category, answer, latencyMs, units] = positional;
  const task = { ...generateRoundTask(seed, category), maxDurationMs: Number(flag("max-ms", 90_000)), unitBudget: Number(flag("budget", 3000)) };
  console.log(JSON.stringify(scoreSubmission(task, { answer, latencyMs: Number(latencyMs), units: Number(units) }), null, 2));
} else {
  console.log(`ruln-tasks — reproduce and score RULN arena matches

  ruln-tasks match <matchSeed> [firstCategory] [--answer]      all three rounds of a match
  ruln-tasks task <roundSeed> <category> [--answer]           one round (round seeds look like <matchSeed>:r1)
  ruln-tasks score <roundSeed> <category> <answer> <latencyMs> <tokens> [--max-ms 90000] [--budget 3000]

Categories: ${CATEGORIES.join(", ")}`);
  process.exitCode = command ? 1 : 0;
}
