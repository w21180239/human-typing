import test from 'node:test';
import assert from 'node:assert/strict';
import { lib, INPUTS, replay } from './helpers.mjs';

const { plan, detectSpans, markText, parseMarks } = lib;
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

test('plan reproduces the text across 300 seeds, with and without spans', () => {
  for (const text of INPUTS) {
    const spans = detectSpans(text).filter(s => s.paste);
    for (const seed of SEEDS) {
      for (const sp of [[], spans]) {
        // High rates stress the typo, retype and transposition paths.
        const p = plan(text, { seed, spans: sp, typo: 0.25, retype: 0.1 });
        assert.equal(p.final, text, `seed ${seed} text ${JSON.stringify(text)}`);
        assert.equal(replay(p.events), text, `replay seed ${seed} text ${JSON.stringify(text)}`);
      }
    }
  }
});

test('same seed gives identical events', () => {
  const text = INPUTS[7];
  const spans = detectSpans(text).filter(s => s.paste);
  const a = plan(text, { seed: 42, spans, typo: 0.1 });
  const b = plan(text, { seed: 42, spans, typo: 0.1 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.events, plan(text, { seed: 43, spans, typo: 0.1 }).events);
});

test('typos never start inside a paste span', () => {
  for (const text of INPUTS.filter(t => t.length > 20)) {
    const spans = detectSpans(text).filter(s => s.paste);
    const cps = [...text];
    const cpIndex = u => [...text.slice(0, u)].length; // code-unit offset -> code-point index
    for (const seed of SEEDS) {
      const { events } = plan(text, { seed, spans, typo: 0.3, retype: 0.1 });
      assert.equal(events.filter(e => e.k === 'paste').length, spans.length, 'one paste event per span');
      const buf = [];
      let n = 0;
      for (const e of events) {
        if (e.k === 'char') buf.push(e.ch);
        else if (e.k === 'back') buf.pop();
        else if (e.k === 'chunk') buf.push(...e.text);
        else {
          const sp = spans[n++];
          // Before the paste the field holds exactly the clean prefix; after it, prefix plus span.
          assert.equal(buf.join(''), cps.slice(0, cpIndex(sp.start)).join(''), `prefix at paste ${n}, seed ${seed}`);
          assert.equal(e.text, sp.text);
          buf.push(...e.text);
          assert.equal(buf.join(''), cps.slice(0, cpIndex(sp.end)).join(''));
        }
      }
    }
  }
});

test('parseMarks(markText(t, spans)) round-trips text and spans', () => {
  for (const text of INPUTS.filter(Boolean)) {
    const spans = detectSpans(text);
    const pasted = spans.filter(s => s.paste);
    const back = parseMarks(markText(text, spans));
    assert.equal(back.text, text);
    assert.deepEqual(back.spans, pasted.map(({ start, end }) => ({ start, end })));
  }
});
