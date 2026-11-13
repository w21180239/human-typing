import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lib } from './helpers.mjs';

const load = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const pasted = text => lib.detectSpans(text).filter(s => s.paste).map(s => s.text);

test('spans corpus: every case matches exactly', () => {
  const cases = load('spans.json');
  assert.ok(cases.length > 0);
  for (const c of cases) assert.deepEqual(pasted(c.text), c.paste, JSON.stringify(c.text));
});

test('spans holdout: precision >= 0.95 and recall >= 0.9', () => {
  let tp = 0, fp = 0, fn = 0;
  for (const c of load('spans-holdout.json')) {
    const left = [...c.paste];
    for (const g of pasted(c.text)) {
      const i = left.indexOf(g);
      if (i >= 0) { left.splice(i, 1); tp++; } else fp++;
    }
    fn += left.length;
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  assert.ok(precision >= 0.95, `precision ${precision}`);
  assert.ok(recall >= 0.9, `recall ${recall}`);
});
