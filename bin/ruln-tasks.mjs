#!/usr/bin/env node
import { CATEGORIES, generateTask, scoreSubmission } from "../src/index.mjs";

const [command, ...args] = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const positional = args.filter((value, i) => !value.startsWith("--") && !args[i - 1]?.startsWith("--"));

function usage() {
  console.log(`ruln-tasks — reproduce and score RULN arena tasks

  ruln-tasks task <seed> [category] [--answer]
  ruln-tasks score <seed> <category> <answer> <latencyMs> <tokens> [--max-ms 45000] [--budget 1500]

Categories: ${CATEGORIES.join(", ")}`);
}

if (command === "task" && positional[0]) {
  const task = generateTask(positional[0], positional[1]);
  const { expected, ...open } = task;
  console.log(JSON.stringify(args.includes("--answer") ? task : open, null, 2));
} else if (command === "score" && positional.length >= 5) {
  const [seed, category, answer, latencyMs, units] = positional;
  const task = { ...generateTask(seed, category), maxDurationMs: Number(flag("max-ms", 45_000)), unitBudget: Number(flag("budget", 1500)) };
  console.log(JSON.stringify(scoreSubmission(task, { answer, latencyMs: Number(latencyMs), units: Number(units) }), null, 2));
} else {
  usage();
  process.exitCode = command ? 1 : 0;
}
