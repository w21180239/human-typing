#!/usr/bin/env node
// Scores the light-mode span rules against tests/fixtures/spans.json.
//   node tools/span-eval.mjs [--verbose]
import { readFileSync } from 'node:fs';
import { detectSpans } from '../plugins/human-typing/skills/human-typing/scripts/humantype.mjs';

const cases = JSON.parse(readFileSync(process.argv.find(a => a.endsWith('.json')) ?? new URL('../tests/fixtures/spans.json', import.meta.url), 'utf8'));
const verbose = process.argv.includes('--verbose');
let tp = 0, fp = 0, fn = 0, exact = 0;
for (const c of cases) {
  const got = detectSpans(c.text).filter(s => s.paste).map(s => s.text);
  const want = [...c.paste];
  const left = [...want];
  let caseTp = 0;
  for (const g of got) {
    const i = left.indexOf(g);
    if (i >= 0) { left.splice(i, 1); caseTp++; } else fp++;
  }
  tp += caseTp;
  fn += left.length;
  const ok = got.length === want.length && caseTp === want.length;
  if (ok) exact++;
  if (verbose && !ok) console.log(`MISS ${JSON.stringify(c.text)}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
}
const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
console.log(JSON.stringify({ cases: cases.length, exact, precision: +p.toFixed(3), recall: +r.toFixed(3), tp, fp, fn }));
