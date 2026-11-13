import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCRIPT } from './helpers.mjs';

const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const dir = mkdtempSync(join(tmpdir(), 'humantype-test-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));

test('plan with a newline and no --newline exits 2', () => {
  const r = run('plan', 'a\nb', '--target', 'browsermcp', '--seed', '1');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--newline/);
});

test('--mode strong with a differing --orig-file exits 3', () => {
  const orig = join(dir, 'orig.txt');
  writeFileSync(orig, 'Run foo_bar_baz now');
  const r = run('plan', 'Run [[foo_bar_qux]] now', '--target', 'browsermcp', '--mode', 'strong', '--orig-file', orig, '--seed', '1');
  assert.equal(r.status, 3);
});

test('--mode strong with a matching --orig-file succeeds', () => {
  const orig = join(dir, 'orig-ok.txt');
  writeFileSync(orig, 'Run foo_bar_baz now\n');
  const r = run('plan', 'Run [[foo_bar_baz]] now', '--target', 'browsermcp', '--mode', 'strong', '--orig-file', orig, '--seed', '1');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).meta.pastes[0], 'foo_bar_baz');
});

test('--mode foo exits 2', () => {
  assert.equal(run('plan', 'hello', '--target', 'browsermcp', '--mode', 'foo').status, 2);
});

test('--version matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const r = run('--version');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), pkg.version);
});

test('verify prints a backslash-free eval for browsermcp and a javascript_exec object for chrome', () => {
  const bm = join(dir, 'bm.json');
  const ch = join(dir, 'ch.json');
  assert.equal(run('plan', 'Hello there, friend.', '--target', 'browsermcp', '--seed', '3', '--out', bm).status, 0);
  assert.equal(run('plan', 'Hello there, friend.', '--target', 'chrome', '--tab', '9', '--seed', '3', '--out', ch).status, 0);

  const v1 = run('verify', bm);
  assert.equal(v1.status, 0);
  const line = v1.stdout.trim();
  assert.match(line, /^eval "\(\) => \{.*\}"$/);
  assert.ok(!line.includes('\\'), 'no backslash in the eval line');

  const v2 = JSON.parse(run('verify', ch).stdout);
  assert.equal(v2.action, 'javascript_exec');
  assert.equal(v2.tabId, 9);
});

test('brief prints NO_CANDIDATES for plain prose', () => {
  const r = run('brief', 'Just a plain sentence with nothing code like in it.', '--out', join(dir, 'x.json'));
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), 'NO_CANDIDATES');
});

test('batch with an out-of-range index exits 2', () => {
  const f = join(dir, 'p.json');
  assert.equal(run('plan', 'Hello there.', '--target', 'browsermcp', '--seed', '1', '--out', f).status, 0);
  assert.equal(run('batch', f, '0').status, 0);
  assert.equal(run('batch', f, '99').status, 2);
});
