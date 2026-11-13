import test from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';

const { plan, render, detectSpans } = lib;
const TEXT = 'Run fetch_user_profile now, then call getUserById(id) and read src/lib/utils.ts again.\nDone.';
const spans = detectSpans(TEXT).filter(s => s.paste);
const events = plan(TEXT, { seed: 7, spans }).events;
assert.ok(spans.length >= 2 && events.some(e => e.k === 'paste'));

const isClip = (target, a) => (target === 'chrome' ? a.name === 'javascript_tool' : a.startsWith('eval '));
const isPasteKey = (target, a) => (target === 'chrome'
  ? a.name === 'computer' && a.input.action === 'key' && ['ctrl+v', 'cmd+v'].includes(a.input.text)
  : (a === 'press Control+v' || a === 'press Meta+v'));

test('chrome output items are {name, input} with tabId', () => {
  const batches = render(events, 'chrome', { tab: 12, newline: 'enter' });
  assert.ok(batches.length > 0);
  for (const a of batches.flat()) {
    assert.equal(typeof a.name, 'string');
    assert.equal(typeof a.input, 'object');
    assert.equal(a.input.tabId, 12);
  }
});

test('browsermcp output is newline-joined strings', () => {
  const batches = render(events, 'browsermcp', { newline: 'enter' });
  assert.ok(batches.every(b => typeof b === 'string'));
  assert.ok(batches.some(b => b.includes('\n')));
});

for (const target of ['chrome', 'browsermcp']) {
  for (const chunk of [3, 150]) {
    test(`${target}: clipboard write is followed by the paste key in the same batch (chunk ${chunk})`, () => {
      const out = render(events, target, { tab: 1, chunk, newline: 'enter' });
      const batches = target === 'chrome' ? out : out.map(b => b.split('\n'));
      let clips = 0;
      for (const batch of batches) {
        batch.forEach((a, i) => {
          if (!isClip(target, a)) return;
          clips++;
          assert.ok(i + 1 < batch.length && isPasteKey(target, batch[i + 1]), `clip at ${i} of ${batch.length} lacks the paste key in its batch`);
        });
      }
      assert.equal(clips, spans.length);
    });
  }
}

test('newline shift emits the shift chord', () => {
  const nl = [{ k: 'char', ch: 'a', gap: 100 }, { k: 'char', ch: '\n', gap: 100 }, { k: 'char', ch: 'b', gap: 100 }];
  const keys = target => opts => render(nl, target, opts).flat().flatMap(a => (typeof a === 'string' ? a.split('\n') : [a]));
  assert.ok(keys('chrome')({ tab: 1, newline: 'shift' }).some(a => a.input.action === 'key' && a.input.text === 'shift+Return'));
  assert.ok(keys('chrome')({ tab: 1, newline: 'enter' }).some(a => a.input.text === 'Return'));
  assert.ok(keys('browsermcp')({ newline: 'shift' }).includes('press Shift+Enter'));
  assert.ok(keys('browsermcp')({ newline: 'enter' }).includes('press Enter'));
});

test('chrome without tab throws', () => {
  assert.throws(() => render(events, 'chrome'), /--tab is required/);
});
