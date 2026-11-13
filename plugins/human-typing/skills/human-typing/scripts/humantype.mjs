#!/usr/bin/env node
// Human-like typing planner. Builds a keystroke timeline (bigram speed-ups, word-boundary
// slowdowns, thinking pauses, neighbour-key typos with delayed correction, occasional word
// re-typing) and renders it for Browser MCP or Claude in Chrome. Timing ideas follow
// Lax3n/HumanTyping (MIT); code is original.
//
// Code-like spans (identifiers, calls, paths, URLs, hashes, `backticks`) are pasted, as an
// engineer copies them from an editor: pause, real clipboard + Ctrl+V, short pause, type on.
//
// Span modes: light (default) pastes what the rules find; strong pastes the [[...]] marks an
// LLM marker wrote (see `brief`); off types everything.
const USAGE = `humantype 0.1.0 - human-like typing plans for Claude in Chrome and Browser MCP

  humantype spans "<text>" [--paste-min 8]      rule candidates + marked text
  humantype brief --text-file PATH --out PATH   prompt for the strong-mode LLM marker
  humantype plan "<text>" --target chrome|browsermcp [--tab N] [--mode light|strong|off]
                 [--wpm 86] [--typo 0.02] [--retype 0.01] [--think 0.03] [--seed N]
                 [--newline enter|shift] [--paste-min 8] [--orig-file PATH] [--chunk 150]
                 [--overhead MS] [--text-file PATH] [--out PATH] [--timeline]
  humantype batch PLAN.json N                   print batch N (0-based) of a saved plan
  humantype verify PLAN.json                    print the field check for the plan's target
  humantype clip save|restore                   keep the user's clipboard across a run
  humantype serve [--port 8765]                 local probe page that logs keydown gaps

Docs: https://github.com/w21180239/human-typing`;

import { existsSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url).replace(/\\/g, '/');

// Per-action cost measured 2026-11-13 (see references/calibration.md): preMs before the keydown, postMs after it.
// Browser MCP `press` fires the key at once, then blocks ~470 ms waiting for a navigation.
const ADAPTERS = {
  chrome: { preMs: 18, backPreMs: 18, backPostMs: 0, pasteKey: 'ctrl+v' },
  browsermcp: { preMs: 50, backPreMs: 50, backPostMs: 470, pasteKey: 'Control+v' },
};
// Chrome on macOS pastes with Cmd+V; the planner runs on the machine that hosts the browser.
if (process.platform === 'darwin') { ADAPTERS.chrome.pasteKey = 'cmd+v'; ADAPTERS.browsermcp.pasteKey = 'Meta+v'; }

// --- code-span detection (light mode) ------------------------------------------------------
// Rules approximate what an engineer copies from the editor instead of typing. The labelled
// corpora in tests/fixtures/ score them: node tools/span-eval.mjs.

const ALWAYS = new Set(['url', 'path', 'hash', 'uuid', 'message', 'log']); // pasted regardless of length
const FLAG_MIN = 14; // --max-old-space-size is copied, --dry-run is typed

const words = s => s.trim().split(/\s+/);
// Typed from memory: language built-ins, framework hooks, standard calls.
const KNOWN_NAMES = new Set(words(`
  print len range str int dict list set map filter zip open input type isinstance super self this
  useState useEffect useMemo useCallback useRef useContext useReducer useLayoutEffect useId
  useQuery useMutation useRouter useNavigate useParams useSelector useDispatch useSWR
  setTimeout setInterval clearTimeout clearInterval addEventListener removeEventListener
  parseInt parseFloat toString forEach querySelector getElementById fetch require
  printf println sprintf malloc free strlen main init README null undefined true false None
  NaN async await return typeof instanceof localhost`));
// Standard-library namespaces: `ns.member` with at most two members and empty parens is typed.
const STDLIB_CHAIN = new RegExp('^(?:console|JSON|Object|Array|Math|Promise|Number|String|Date|Reflect|Symbol|Intl|Buffer'
  + '|process|os|sys|fmt|strings|strconv|errors|path|fs|http|url|util|crypto|document|window|navigator|localStorage'
  + '|sessionStorage|System|Arrays|Collections|Optional|std|re|json|np|pd|plt|time|datetime|math|random|logging'
  + '|subprocess|shutil|typing|io|bufio|log|React|ReactDOM|Vec|Option|Result|Ok|Err)(?:\\.|::)[A-Za-z_$][\\w$]*'
  + '(?:\\.[A-Za-z_$][\\w$]*)?(?:\\(\\))?$');
// Product and brand names, compared lowercased with dots, spaces and dashes removed.
const BRANDS = new Set(words(`
  javascript typescript python golang rust java kotlin swift csharp cplusplus postgresql postgres mysql
  mariadb sqlite mongodb redis graphql github gitlab bitbucket powershell youtube linkedin openai chatgpt
  iphone ipad macos ios ipados watchos android devops fastapi nextjs nodejs nuxtjs vuejs reactjs angularjs
  vscode intellij pycharm webstorm xcode dynamodb bigquery cloudfront cloudflare wordpress paypal deepseek
  kubernetes webassembly websocket websockets rabbitmq elasticsearch opensearch clickhouse snowflake
  terraform ansible jenkins circleci gradle webpack eslint prettier tailwindcss sveltekit firebase
  supabase vercel netlify heroku digitalocean azure jira confluence figma notion dropbox onedrive sharepoint
  airtable hubspot salesforce shopify stripe twilio sendgrid mailchimp zendesk datadog grafana prometheus
  pagerduty newrelic splunk kibana logstash pytorch tensorflow numpy pandas jupyter matplotlib huggingface
  langchain llamaindex anthropic copilot testflight appstore springboot hibernate django laravel symfony
  dotnet aspnet blazor xamarin openapi swagger postman homebrew chocolatey dockerhub minikube argocd
  kafka zookeeper hadoop airflow tableau powerbi whatsapp wechat telegram discord bluetooth microsoft
  youtube netflix spotify airbnb nvidia qualcomm huawei xiaomi lenovo playwright puppeteer selenium
  cypress storybook graphiql jetbrains bitwarden onepassword lastpass macbook thinkpad`));
// Well-known file names, lowercased.
const KNOWN_FILES = new Set(words(`
  package.json package-lock.json tsconfig.json jsconfig.json readme.md readme dockerfile makefile .env
  .gitignore .dockerignore .editorconfig .npmrc .nvmrc cargo.toml cargo.lock go.mod go.sum
  requirements.txt pyproject.toml setup.py setup.cfg pom.xml build.gradle yarn.lock pnpm-lock.yaml
  docker-compose.yml docker-compose.yaml compose.yaml index.js index.ts index.html main.go main.py
  main.rs lib.rs app.py app.js server.js changelog.md license contributing.md agents.md claude.md
  .eslintrc .prettierrc vite.config.ts vite.config.js webpack.config.js jest.config.js babel.config.js
  next.config.js tailwind.config.js gemfile procfile`));
const TLD = '(?:com|org|net|io|dev|ai|co|app|gov|edu|nz|uk|au|cn|de|jp|fr|me|sh|so|xyz|info|cloud|tech|site|local|internal)';
const DOMAIN_RE = new RegExp(`^(?:[\\w-]+\\.)+${TLD}$`, 'i');
const HOST_PATH_RE = new RegExp(`^(?:[\\w-]+\\.)+${TLD}(?::\\d+)?/\\S+$`, 'i');

function isKnown(t) {
  const base = t.replace(/\(\)$/, '');
  const flat = t.toLowerCase().replace(/[.\s-]/g, '');
  return KNOWN_NAMES.has(base) || BRANDS.has(flat) || KNOWN_FILES.has(t.toLowerCase())
    || /^[A-Z][A-Za-z0-9]*\.js$/.test(t) || STDLIB_CHAIN.test(t) || DOMAIN_RE.test(t);
}

function classify(t) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return 'uuid';
  if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t) || HOST_PATH_RE.test(t)) return 'url';
  if (isKnown(t)) return null;
  if (/^@[\w.-]+\/[\w.-]+$/.test(t)) return 'package';
  if (/^([A-Za-z]:\\|~\/|\.{1,2}\/|\/\w)/.test(t) || /[\w-][\\/][\w.-]*\.\w{1,6}$/.test(t)) return 'path';
  if (/^(?=.*\d)(?=.*[a-f])[0-9a-f]{7,40}$/.test(t)) return 'hash';
  if (/^v?\d+\.\d+\.\d+[\w.+-]*$/.test(t)) return 'version';
  if (/^[A-Za-z_][\w.-]*=\S+$/.test(t)) return 'config';
  if (/^--?[a-z][\w-]*$/.test(t)) return 'flag';
  if (/[A-Za-z_$][\w$]*\(/.test(t)) return 'call';
  if (/[\w$]{2,}(\.|::|->)[A-Za-z_$][\w$]*/.test(t)) return 'member';
  if (/[A-Za-z0-9]_[A-Za-z0-9]|^_{1,2}[A-Za-z]/.test(t)) return 'snake_case';
  if (/^[a-z][a-z0-9]*[A-Z]/.test(t)) return 'camelCase';
  if (/^(?:[A-Z][a-z0-9]+){2,}$/.test(t)) return 'PascalCase';
  return null;
}

const count = (s, c) => s.split(c).length - 1;

// Strip prose punctuation around a whitespace token; keep the closing paren of a call.
function trimToken(tok) {
  let s = 0;
  let e = tok.length;
  while (s < e && `"'([{<`.includes(tok[s])) s++;
  while (s < e) {
    const c = tok[e - 1];
    if (`"',.;:!?>]}`.includes(c)) e--;
    else if (c === ')' && count(tok.slice(s, e), ')') > count(tok.slice(s, e), '(')) e--;
    else break;
  }
  if (tok.slice(s, e).endsWith("'s")) e -= 2; // possessive stays typed
  return [s, e];
}

const ERROR_WORDS = /\b(?:error|exception|failed|failure|cannot|can't|couldn't|unable|not found|undefined|denied|invalid|timed out|timeout|refused|panic|fatal|traceback|errno)\b|\bE[A-Z]{3,}\b/i;
const [LQ, RQ] = [String.fromCharCode(0x201c), String.fromCharCode(0x201d)]; // curly quotes; file stays ASCII
// Whole-message spans: quoted error text, log lines with a level, `SomeError: ...` lines.
const MESSAGE_RES = [
  // Windows paths may hold spaces in every segment but the last.
  ['path', /[A-Za-z]:\\(?:[^\\\n"<>|?*]+\\)*[^\\\s"<>|?*,;]+/g, () => true],
  ['message', new RegExp(`["${LQ}]([^"${RQ}\\n]{20,})["${RQ}]`, 'g'), m => ERROR_WORDS.test(m[1])],
  ['log', /(?:\d{4}-\d\d-\d\d[T ][\d:.]+Z?\s+)?\[?(?:ERROR|WARN(?:ING)?|FATAL|CRITICAL|PANIC)\]?:?\s+\S(?:(?!\s--\s)[^\n])*/g, () => true],
  ['log', /^[ \t]*(?:[A-Z]\w*(?:Error|Exception)|panic|Traceback \(most recent call last\)):[^\n]*/gm, () => true],
];

// Candidates in code-unit offsets: { start, end, text, reason, paste }.
export function detectSpans(text, { min = 8 } = {}) {
  const found = [];
  const taken = [];
  const free = (a, b) => !taken.some(([x, y]) => a < y && b > x);
  const add = (start, end, reason, paste) => {
    found.push({ start, end, text: text.slice(start, end), reason, paste });
    taken.push([start, end]);
  };
  for (const [reason, re, ok] of MESSAGE_RES) {
    for (const m of text.matchAll(re)) {
      if (!ok(m)) continue;
      const inner = m[1] ?? m[0].trimStart();
      let start = m.index + m[0].indexOf(inner);
      let end = start + inner.length;
      while (end > start && /[\s.]/.test(text[end - 1])) end--;
      if (free(start, end)) add(start, end, reason, true);
    }
  }
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const start = m.index + 1;
    const t = m[1];
    if (!free(m.index, m.index + m[0].length)) continue;
    taken.push([m.index, m.index + m[0].length]);
    const reason = classify(t);
    // Known names and short plain commands (`npm run build`) are typed.
    if (isKnown(t) || /^[a-z][a-z0-9-]*(?: [a-z][\w-]*){0,3}$/.test(t)) {
      found.push({ start, end: start + t.length, text: t, reason: 'backticks', paste: false });
      continue;
    }
    const paste = ALWAYS.has(reason) || t.length >= min;
    found.push({ start, end: start + t.length, text: t, reason: 'backticks', paste });
  }
  // Whitespace tokens, except a call's argument list may contain spaces: f(a, { b: 1 }).
  for (const m of text.matchAll(/(?:[\w$.]+\((?:[^()\n]|\([^()\n]*\))*\)|\S)+/g)) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const [s, e] = trimToken(m[0]);
    const t = m[0].slice(s, e);
    const reason = t && classify(t);
    if (!reason) continue;
    const paste = ALWAYS.has(reason) || t.length >= (reason === 'flag' ? FLAG_MIN : min);
    found.push({ start: m.index + s, end: m.index + e, text: t, reason, paste });
  }
  found.sort((a, b) => a.start - b.start);
  // A repeat mention is typed from memory unless it is long.
  const seen = new Set();
  for (const sp of found) {
    if (!sp.paste) continue;
    // Also typed: a bare identifier already pasted inside a longer span (Foo.bar() then Foo).
    if (seen.has(sp.text) && sp.text.length <= 20) sp.paste = false;
    seen.add(sp.text);
    for (const part of sp.text.match(/[A-Za-z_$][\w$]{7,}/g) ?? []) seen.add(part);
  }
  return found;
}

export function markText(text, spans) {
  let out = '';
  let at = 0;
  for (const sp of spans.filter(x => x.paste)) {
    out += text.slice(at, sp.start) + '[[' + text.slice(sp.start, sp.end) + ']]';
    at = sp.end;
  }
  return out + text.slice(at);
}

// "[[...]]" marks paste spans; returns the clean text and their offsets.
export function parseMarks(marked) {
  let text = '';
  const spans = [];
  let at = 0;
  for (const m of marked.matchAll(/\[\[([\s\S]+?)\]\]/g)) {
    text += marked.slice(at, m.index);
    spans.push({ start: text.length, end: text.length + m[1].length });
    text += m[1];
    at = m.index + m[0].length;
  }
  return { text: text + marked.slice(at), spans };
}

// --- clipboard ---------------------------------------------------------------------------

const SAVED = join(tmpdir(), 'humantype-clip-saved.txt');

function ps(script) {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`powershell failed: ${r.stderr}`);
}

function clipSet(text) {
  if (process.platform === 'win32') {
    const f = join(tmpdir(), `humantype-clip-${process.pid}.txt`);
    writeFileSync(f, text, 'utf8');
    try { ps(`Set-Clipboard -Value ([IO.File]::ReadAllText('${f.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`); }
    finally { unlinkSync(f); }
    return;
  }
  const [cmd, args] = process.platform === 'darwin' ? ['pbcopy', []] : ['xclip', ['-selection', 'clipboard']];
  const r = spawnSync(cmd, args, { input: text });
  if (r.status !== 0) throw new Error(`${cmd} failed`);
}

function clipGetToFile(f) {
  if (process.platform === 'win32') {
    ps(`[IO.File]::WriteAllText('${f.replace(/'/g, "''")}', [string](Get-Clipboard -Raw), [Text.Encoding]::UTF8)`);
    return;
  }
  const [cmd, args] = process.platform === 'darwin' ? ['pbpaste', []] : ['xclip', ['-selection', 'clipboard', '-o']];
  writeFileSync(f, spawnSync(cmd, args, { encoding: 'utf8' }).stdout ?? '', 'utf8');
}

const NEIGHBOURS = (() => {
  const rows = ['1234567890-=', 'qwertyuiop[]', "asdfghjkl;'", 'zxcvbnm,./'];
  const map = {};
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const near = [];
      for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, -1]]) {
        const ch2 = rows[r + dr]?.[c + dc];
        // Letters only slip to letters; a digit inside a word reads as a bot artefact.
        if (ch2 && (!/[a-z]/.test(ch) || /[a-z]/.test(ch2))) near.push(ch2);
      }
      map[ch] = near;
    });
  });
  return map;
})();

const FAST_BIGRAMS = new Set(('th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri ro ic ne ea ra ce li ch ll be ma si om ur').split(' '));
const COMMON_WORDS = new Set(('the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us is are was were').split(' '));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const rnd = mulberry32(seed);
  const gauss = () => {
    const u = 1 - rnd();
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    rnd,
    chance: p => rnd() < p,
    range: (lo, hi) => lo + rnd() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(rnd() * arr.length)],
    logn: (median, sigma) => median * Math.exp(sigma * gauss()),
  };
}

const isWordChar = ch => /[A-Za-z0-9']/.test(ch);
// CJK symbols + ideographs, Hangul, full-width forms (built from code points to keep the file ASCII).
const CJK_RE = new RegExp('[' + [[0x3000, 0x9fff], [0xac00, 0xd7af], [0xff00, 0xffef]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');
const isCJK = ch => CJK_RE.test(ch);

function typoFor(ch, rng) {
  const lower = ch.toLowerCase();
  const near = NEIGHBOURS[lower];
  if (!near?.length) return null;
  const wrong = rng.pick(near);
  return ch === lower ? wrong : wrong.toUpperCase();
}

// Timeline events: { k: 'char', ch, gap } | { k: 'back', gap } | { k: 'chunk', text, gap }
// | { k: 'paste', text, gap }. gap = ms to wait before this keystroke.
// opts.spans: [{ start, end }] in code-unit offsets of text, pasted instead of typed.
export function plan(text, opts = {}) {
  // Defaults: fluent second-language English typist (see references/calibration.md).
  const o = { wpm: 86, seed: Date.now() & 0xffffffff, typo: 0.02, retype: 0.01, think: 0.03, spans: [], ...opts };
  const rng = makeRng(o.seed);
  const base = 60000 / (o.wpm * 5);
  const ev = [];
  const out = []; // what the field contains, to know what to retype
  let prev = '';
  let wordIdx = 0;
  let inHard = false; // inside a long uncommon word: second-language spelling recall slows it

  const charGap = (ch, p, atWordStart) => {
    let g = rng.logn(base, 0.35);
    if (inHard && isWordChar(ch)) g *= 1.12;
    const bigram = (p + ch).toLowerCase();
    if (FAST_BIGRAMS.has(bigram)) g *= 0.65;
    if (p && p.toLowerCase() === ch.toLowerCase()) g *= 0.8; // double letter
    if (/[A-Z]/.test(ch)) g += rng.range(40, 110); // shift
    if (/[0-9]/.test(ch)) g *= 1.3;
    if (/[^A-Za-z0-9 ]/.test(ch)) g *= 1.5;
    if (ch === ' ') g *= rng.range(1.1, 1.5);
    if (atWordStart && p) g *= rng.range(1.3, 2.0); // cross-word slowdown
    if (/[,;:]/.test(p) && ch === ' ') g += rng.range(150, 450);
    if (/[.!?]/.test(p) && ch === ' ') g += rng.range(350, 1100);
    if (p === '\n') g += rng.range(500, 1500);
    return Math.max(25, g);
  };

  const push = e => { ev.push(e); };
  const typeChar = (ch, gap) => { push({ k: 'char', ch, gap: Math.round(gap) }); out.push(ch); };
  const backspace = gap => { push({ k: 'back', gap: Math.round(gap) }); out.pop(); };

  const chars = [...text];
  // Map code-unit offsets to code-point indices.
  const cp = new Array(text.length + 1);
  for (let u = 0, c = 0; u <= text.length; c++) {
    cp[u] = c;
    if (u === text.length) break;
    u += text.codePointAt(u) > 0xffff ? 2 : 1;
  }
  const spanAt = new Map();
  const inSpan = new Uint8Array(chars.length + 1);
  for (const sp of o.spans) {
    const a = cp[sp.start];
    const b = cp[sp.end];
    if (a == null || b == null || b <= a) throw new Error(`bad span ${JSON.stringify(sp)}`);
    spanAt.set(a, b);
    inSpan.fill(1, a, b);
  }
  let afterPaste = false;
  let lastPasteEnd = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (spanAt.has(i)) {
      // Switch to the editor, find, select, copy, switch back; then one Ctrl+V.
      const end = spanAt.get(i);
      const piece = chars.slice(i, end).join('');
      push({ k: 'paste', text: piece, gap: Math.round(rng.range(1500, 5000)) });
      out.push(...chars.slice(i, end));
      prev = chars[end - 1];
      i = end - 1;
      inHard = false;
      afterPaste = true;
      lastPasteEnd = end;
      continue;
    }

    if (isCJK(ch)) {
      // IME commit: type a 1-3 char run as one chunk.
      let run = ch;
      const n = rng.int(1, 3);
      while (run.length < n && isCJK(chars[i + 1] ?? '')) run += chars[++i];
      push({ k: 'chunk', text: run, gap: Math.round(rng.range(350, 1100) + (rng.chance(o.think) ? rng.range(800, 2500) : 0)) });
      out.push(...run);
      prev = run.at(-1);
      continue;
    }

    const atWordStart = isWordChar(ch) && !isWordChar(prev);
    const word = atWordStart ? text.slice(i).match(/^[A-Za-z0-9']+/)?.[0] ?? '' : '';
    if (atWordStart) {
      wordIdx++;
      inHard = word.length >= 7 && !COMMON_WORDS.has(word.toLowerCase()) && /[a-z]/i.test(word);
    } else if (!isWordChar(ch)) inHard = false;
    let gap = charGap(ch, prev, atWordStart);
    if (afterPaste) { gap += rng.range(300, 1000); afterPaste = false; } // glance at the pasted text
    if (atWordStart && inHard) gap *= 1.35;
    if (atWordStart && wordIdx > 1 && rng.chance(o.think * (inHard ? 2.5 : 1))) gap += rng.range(500, 1800); // thinking pause

    // Typos are likelier at word starts and in long or uncommon words.
    let pTypo = o.typo * (atWordStart ? 1.6 : 1) * (inHard ? 1.4 : 1);
    if (/[A-Za-z]/.test(ch) && rng.chance(pTypo)) {
      const kind = rng.rnd();
      const next = chars[i + 1];
      if (kind < 0.25 && next && !inSpan[i + 1] && isWordChar(next) && next !== ch) {
        // Transposition: type next then ch, notice, fix both.
        typeChar(next, gap);
        typeChar(ch, charGap(ch, next, false));
        const notice = rng.range(180, 500);
        backspace(notice);
        backspace(rng.logn(110, 0.25));
        typeChar(ch, rng.logn(base * 1.1, 0.3));
        typeChar(next, charGap(next, ch, false));
        prev = next;
        i++;
        continue;
      }
      if (kind >= 0.85) {
        // Doubled letter: key bounces, one backspace.
        typeChar(ch, gap);
        typeChar(ch, rng.logn(60, 0.3));
        backspace(rng.range(200, 550));
        prev = ch;
        continue;
      }
      const wrong = typoFor(ch, rng);
      if (wrong) {
        typeChar(wrong, gap);
        // Keep going 0-2 more chars inside the word before noticing.
        let extra = 0;
        const runOn = rng.chance(0.55) ? rng.int(1, 2) : 0;
        let p2 = wrong;
        while (extra < runOn && chars[i + 1 + extra] && !inSpan[i + 1 + extra] && isWordChar(chars[i + 1 + extra])) {
          const c2 = chars[i + 1 + extra];
          typeChar(c2, charGap(c2, p2, false));
          p2 = c2;
          extra++;
        }
        backspace(rng.range(200, 600)); // notice
        for (let b = 0; b < extra; b++) backspace(rng.logn(105, 0.25));
        typeChar(ch, rng.logn(base * 1.15, 0.3));
        for (let b = 0; b < extra; b++) {
          const c2 = chars[i + 1 + b];
          typeChar(c2, charGap(c2, chars[i + b], false));
        }
        prev = chars[i + extra];
        i += extra;
        continue;
      }
    }

    typeChar(ch, gap);
    prev = ch;

    // Occasional re-type: finish a word, delete it, type it again.
    const endOfWord = isWordChar(ch) && (inSpan[i + 1] || !isWordChar(chars[i + 1] ?? ' '));
    if (endOfWord && rng.chance(o.retype)) {
      const m = chars.slice(lastPasteEnd, i + 1).join('').match(/[A-Za-z0-9']+$/);
      const w = m ? [...m[0]] : [];
      if (w.length >= 3) {
        let g2 = rng.range(400, 1200);
        for (let b = 0; b < w.length; b++) { backspace(g2); g2 = rng.logn(95, 0.25); }
        let p3 = '';
        w.forEach((c3, idx) => { typeChar(c3, idx === 0 ? rng.range(300, 800) : charGap(c3, p3, false)); p3 = c3; });
      }
    }
  }
  return { events: ev, final: out.join(''), seed: o.seed };
}

function quoteBM(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// In-page clipboard write right before Ctrl+V, in the same batch: a shell write one agent turn
// earlier lost the race when the user copied something meanwhile (seen 2026-11-13).
const clipJs = text => {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  return `navigator.clipboard.writeText(new TextDecoder().decode(Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0))))`;
};

// Returns batches: chrome -> browser_batch `actions` arrays; browsermcp -> `commands` strings.
const NEWLINE_KEY = { browsermcp: { enter: 'Enter', shift: 'Shift+Enter' }, chrome: { enter: 'Return', shift: 'shift+Return' } };

export function render(events, target, { tab, chunk = 150, overhead, newline = 'enter' } = {}) {
  const ad = { ...ADAPTERS[target] };
  if (overhead != null) ad.preMs = ad.backPreMs = overhead;
  if (target === 'chrome' && tab == null) throw new Error('--tab is required for --target chrome');
  const blocking = e => e.k === 'back' || (e.k === 'paste' && target === 'browsermcp');
  let debt = 0; // time already spent blocking after the previous action
  const waitFor = (e) => {
    const w = Math.max(0, e.gap - (blocking(e) ? ad.backPreMs : ad.preMs) - debt);
    debt = blocking(e) ? ad.backPostMs : 0;
    return w;
  };

  const seg = [];
  const wait = w => {
    if (w < 5) return;
    seg.push(target === 'browsermcp' ? `wait ${Math.round(w)}` : { name: 'computer', input: { action: 'wait', duration: +(w / 1000).toFixed(3), tabId: tab } });
  };
  const key = (text, summary) => seg.push(target === 'browsermcp' ? `press ${text}` : { name: 'computer', input: { action: 'key', text, tabId: tab, action_summary: summary } });

  for (const e of events) {
    if (e.k === 'paste') {
      wait(waitFor(e));
      seg.push(target === 'browsermcp'
        ? `eval "async () => { await ${clipJs(e.text)}; return 'clip'; }"`
        : { name: 'javascript_tool', input: { action: 'javascript_exec', text: `await ${clipJs(e.text)}; 'clip'`, tabId: tab } });
      key(ad.pasteKey, 'Pastes copied code into field');
      continue;
    }
    wait(waitFor(e));
    if (e.k === 'back') key('Backspace', 'Deletes last character in field');
    else if (e.ch === '\n') key(NEWLINE_KEY[target][newline], 'Inserts line break in field');
    else if (target === 'browsermcp') seg.push(e.k === 'chunk' ? `type ${quoteBM(e.text)}` : `type ${quoteBM(e.ch)} --slowly`);
    else seg.push({ name: 'computer', input: { action: 'type', text: e.ch ?? e.text, tabId: tab, action_summary: 'Types next character in field' } });
  }
  // A clipboard write stays in the same batch as its Ctrl+V.
  const batches = [];
  let cur = [];
  const isClip = s => (typeof s === 'string' ? s.startsWith('eval ') : s.name === 'javascript_tool');
  for (let i = 0; i < seg.length; i++) {
    if (cur.length >= chunk && !(i > 0 && isClip(seg[i - 1]))) { batches.push(cur); cur = []; }
    cur.push(seg[i]);
  }
  if (cur.length) batches.push(cur);
  return target === 'browsermcp' ? batches.map(b => b.join('\n')) : batches;
}

function stats(events) {
  const total = events.reduce((s, e) => s + e.gap, 0);
  return {
    keystrokes: events.length,
    backspaces: events.filter(e => e.k === 'back').length,
    pastes: events.filter(e => e.k === 'paste').map(e => e.text),
    totalSec: +(total / 1000).toFixed(1),
    longPauses: events.filter(e => e.gap >= 700).length,
  };
}

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  if (!cmd || cmd === 'help' || flags.help) { console.log(USAGE); return; }
  if (cmd === '--version' || cmd === 'version') { console.log(USAGE.split(' ')[1]); return; }
  const num = (k, d) => (flags[k] === undefined ? d : Number(flags[k]));

  if (cmd === 'serve') {
    const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'testpage.html'));
    const port = num('port', 8765);
    createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); })
      .listen(port, '127.0.0.1', () => console.log(`probe page: http://127.0.0.1:${port}/`));
    return;
  }

  if (cmd === 'clip') {
    const sub = pos[0];
    if (sub === 'save') clipGetToFile(SAVED);
    else if (sub === 'restore') {
      if (!existsSync(SAVED)) return;
      const t = readFileSync(SAVED, 'utf8');
      if (t) clipSet(t);
      unlinkSync(SAVED);
    } else { console.error('usage: humantype clip save|restore'); process.exit(2); }
    console.log(`clip ${sub}: ok`);
    return;
  }

  if (cmd === 'verify') {
    const { meta } = JSON.parse(readFileSync(pos[0], 'utf8'));
    const b64 = Buffer.from(meta.text, 'utf8').toString('base64');
    // value for input/textarea, innerText for contenteditable; MATCH_WS = equal up to whitespace.
    const body = [
      `const el = document.activeElement; const got = 'value' in el ? el.value : el.innerText;`,
      `const want = new TextDecoder().decode(Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0)));`,
      // No backslashes: the Browser MCP eval string is itself quoted.
      `const ws = t => t.replace(new RegExp(String.fromCharCode(92) + 's+', 'g'), ' ').trim(); let i = 0; while (i < got.length && got[i] === want[i]) i++;`,
      `return got === want ? 'MATCH' : ws(got) === ws(want) ? 'MATCH_WS' : 'DIFF at ' + i + ': got ' + JSON.stringify(got.slice(i, i + 30)) + ' want ' + JSON.stringify(want.slice(i, i + 30));`,
    ].join(' ');
    console.log(meta.target === 'browsermcp'
      ? `eval "() => { ${body} }"`
      : JSON.stringify({ action: 'javascript_exec', text: `(() => { ${body} })()`, tabId: meta.tab }));
    return;
  }

  if (cmd === 'batch') {
    const saved = JSON.parse(readFileSync(pos[0], 'utf8'));
    const b = saved.batches[Number(pos[1])];
    if (b === undefined) { console.error(`no batch ${pos[1]} (have ${saved.batches.length})`); process.exit(2); }
    console.log(typeof b === 'string' ? b : JSON.stringify(b));
    return;
  }

  // File-writing tools append a final newline; a trailing line break is never typed from a file.
  const readText = p => readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const raw = flags['text-file'] ? readText(flags['text-file']) : pos[0];
  if (typeof raw !== 'string' || !['plan', 'spans', 'brief'].includes(cmd)) {
    console.error(USAGE);
    process.exit(2);
  }
  const min = num('paste-min', 8);

  if (cmd === 'spans') {
    const spans = detectSpans(raw, { min });
    console.log(JSON.stringify({ spans: spans.map(({ text, reason, paste }) => ({ text, reason, paste })), marked: markText(raw, spans) }, null, 2));
    return;
  }

  if (cmd === 'brief') {
    const spans = detectSpans(raw, { min });
    const tpl = readFileSync(join(dirname(SELF), '..', 'references', 'mark-brief.md'), 'utf8');
    const list = spans.map(s => `- ${s.text}  (${s.reason}${s.paste ? '' : ', short'})`).join('\n') || '- (none)';
    const brief = tpl.replace('{{CANDIDATES}}', () => list).replace('{{OUT}}', () => String(flags.out)).replace('{{TEXT}}', () => raw);
    console.log(spans.length ? brief : 'NO_CANDIDATES');
    return;
  }

  const target = flags.target;
  if (!ADAPTERS[target]) { console.error('need --target chrome|browsermcp'); process.exit(2); }
  let text = raw;
  let spans = [];
  const mode = flags.mode ?? 'light';
  if (!['light', 'strong', 'off'].includes(mode)) { console.error('--mode must be light, strong or off'); process.exit(2); }
  if (mode === 'strong') ({ text, spans } = parseMarks(raw));
  else if (mode === 'light') spans = detectSpans(raw, { min }).filter(s => s.paste);
  if (flags['orig-file']) {
    const orig = readText(flags['orig-file']);
    if (text !== orig) {
      console.error('marked text differs from --orig-file beyond the [[ ]] marks; re-mark it');
      process.exit(3);
    }
  }
  const newline = flags.newline;
  if (text.includes('\n') && !['enter', 'shift'].includes(newline)) {
    console.error('text has line breaks: pass --newline enter (Enter adds a line in this field) or --newline shift (Enter submits, e.g. a chat box)');
    process.exit(2);
  }
  const p = plan(text, {
    ...Object.fromEntries(['wpm', 'typo', 'retype', 'think', 'seed'].filter(k => flags[k] !== undefined).map(k => [k, Number(flags[k])])),
    spans,
  });
  if (p.final !== text) throw new Error(`plan does not reproduce text: ${JSON.stringify(p.final)}`);
  const batches = render(p.events, target, { tab: flags.tab && Number(flags.tab), chunk: num('chunk', 150), overhead: flags.overhead && Number(flags.overhead), newline });
  const meta = { seed: p.seed, target, batches: batches.length, ...stats(p.events) };
  const saved = { meta: { ...meta, tab: flags.tab && Number(flags.tab), text }, batches };
  const json = JSON.stringify(flags.timeline ? { meta, events: p.events } : saved, null, flags.pretty ? 2 : 0);
  if (flags.out) { writeFileSync(flags.out, json); console.log(JSON.stringify(meta)); }
  else console.log(json);
}

// realpath: an npm bin is a symlink to this file.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)).toLowerCase() === realpathSync(resolve(process.argv[1])).toLowerCase()) main();
