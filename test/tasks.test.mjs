import test from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, eloChange, generateTask, scoreSubmission } from "../src/index.mjs";

test("the same seed always produces the same task", () => {
  for (const category of CATEGORIES) assert.deepEqual(generateTask("seed-1", category), generateTask("seed-1", category));
  assert.notDeepEqual(generateTask("seed-1", "math"), generateTask("seed-2", "math"));
});

test("a seed without a category picks one deterministically", () => {
  assert.ok(CATEGORIES.includes(generateTask("any-seed").category));
  assert.equal(generateTask("any-seed").category, generateTask("any-seed").category);
});

test("every category has a verifiable expected answer", () => {
  for (const category of CATEGORIES) {
    const task = generateTask(`check-${category}`, category);
    assert.equal(task.category, category); assert.ok(task.prompt.length > 10); assert.ok(String(task.expected).length > 0);
  }
  assert.equal(generateTask("fixed", "logic").expected, String(eval(generateTask("fixed", "logic").prompt.match(/\(([^)]+)\) \+ (\d+)/).slice(1).join("+").replace("×", "*"))));
});

test("scoring: 70 accuracy, 20 speed, 10 efficiency", () => {
  const task = { ...generateTask("score", "math"), maxDurationMs: 45_000, unitBudget: 1500 };
  const perfect = scoreSubmission(task, { answer: task.expected, latencyMs: 0, units: 40 });
  assert.deepEqual([perfect.total, perfect.accuracy, perfect.speed, perfect.efficiency, perfect.exact], [100, 70, 20, 10, true]);
  const wrong = scoreSubmission(task, { answer: "not a number", latencyMs: 45_000, units: 5000 });
  assert.equal(wrong.total, 0);
  const nearMiss = scoreSubmission(task, { answer: String(Number(task.expected) + 1), latencyMs: 45_000, units: 5000 });
  assert.equal(nearMiss.accuracy, 26);
});

test("answers are compared ignoring case and spaces", () => {
  const task = generateTask("memory-seed", "memory");
  assert.equal(scoreSubmission(task, { answer: ` ${task.expected.toLowerCase().split("").join(" ")} `, latencyMs: 1000, units: 50 }).exact, true);
});

test("Elo: an upset moves more rating than an expected win", () => {
  const upset = eloChange(1400, 1800, true); const expected = eloChange(1800, 1400, true);
  assert.ok(upset.challenger > expected.challenger); assert.equal(upset.challenger, -upset.king);
});
