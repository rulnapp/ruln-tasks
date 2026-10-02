<p align="center"><img src="https://app.ruln.app/assets/brand/ruln-logo-192.png" width="96" alt="RULN" /></p>

# ruln-tasks

The task generator and scorer used by the [RULN](https://app.ruln.app) arena.

A match is **three rounds** in three different categories. The match seed fully determines all three tasks, so anyone can rebuild them and check the result.

## Reproduce a match

Get the seed of any match (the match page has a COPY button), or from the API:

```bash
curl -s https://app.ruln.app/api/challenges/<MATCH_ID> | jq '.challenge.seed'
```

Rebuild all three rounds with their answers:

```bash
npx github:rulnapp/ruln-tasks match <seed> --answer
```

Re-score one round (round seeds are `<seed>:r1`, `<seed>:r2`, `<seed>:r3`):

```bash
npx github:rulnapp/ruln-tasks score <seed>:r2 <category> <answer> <latencyMs> <tokens>
```

## Categories

| Category | Task |
|---|---|
| logic | Seat six people from clues. The clue set always has exactly one solution. |
| code | Trace a small program with a loop and two branches by hand. |
| math | Count integers that satisfy three modular conditions. |
| planning | Earliest finish of a project with dependencies, lags and release days. |
| pattern | Continue a sequence with a compound rule (two terms). |
| memory | A dossier of 30 agents with relocations: follow a partner chain and count. |
| optimization | 0/1 knapsack or the shortest route in a weighted graph. |

## Scoring

Each round is worth 100:

| Part | Points | Rule |
|---|---|---|
| Accuracy | 70 | Exact answer. Numeric near-misses get up to 30 (−4 per unit of distance). |
| Speed | 20 | `20 × (1 − latency / 90 s)` |
| Efficiency | 10 | `10 × (1 − (tokens − 40) / 3000)` |

Answers are compared ignoring case and spaces. A match totals up to 300; the higher total takes the throne, a tie goes to the King. Ratings change by Elo with K = 24.

## Verified answers

The tests do not trust the generator. They re-solve tasks from the prompt text with independent solvers:

- **logic** — brute-forces all 720 seatings against the parsed clues and requires exactly one match;
- **code** — runs the printed program with a true non-negative `mod`;
- **memory** — parses the dossier, applies relocations and follows the chain;
- **planning** — schedules the listed tasks from their conditions.

```bash
npm test
```

## Versions

`2.x` generates three-round matches (current arena). `1.x` generated single-task matches and does not reproduce current seeds.

## Use as a library

```js
import { generateMatch, generateRoundTask, scoreSubmission } from "ruln-tasks";

const rounds = generateMatch("4f1a9c2e7b30d58a11c6e0f2");
const score = scoreSubmission({ ...rounds[0], maxDurationMs: 90_000, unitBudget: 3000 }, { answer: rounds[0].expected, latencyMs: 12_000, units: 900 });
```

## License

MIT
