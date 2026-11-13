#!/usr/bin/env node
// Renders repo-assets/demo.svg: a real plan replayed as an animated SVG, with a keystroke strip.
//   node tools/make-demo-svg.mjs [--seed 7] [--out repo-assets/demo.svg]
import { writeFileSync } from 'node:fs';
import { plan, detectSpans } from '../plugins/human-typing/skills/human-typing/scripts/humantype.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TEXT = 'Can you check why fetch_user_profile returns null when the cache is cold?';
const seed = Number(arg('seed', 7));
const out = arg('out', new URL('../repo-assets/demo.svg', import.meta.url));

const spans = detectSpans(TEXT).filter(s => s.paste);
const p = plan(TEXT, { seed, spans });
if (p.final !== TEXT) throw new Error('plan does not reproduce the text');

// Replay: field content (with paste ranges) and a label after every event.
const frames = [{ t: 0, segs: [], label: 'focus the comment box' }];
const strip = [];
let t = 600;
let segs = []; // [{ text, paste }]
const tail = () => segs[segs.length - 1];
for (const e of p.events) {
  t += e.gap;
  let label;
  if (e.k === 'char' || e.k === 'chunk') {
    const ch = e.k === 'char' ? e.ch : e.text;
    if (tail() && !tail().paste) tail().text += ch; else segs.push({ text: ch, paste: false });
    label = e.gap > 450 ? `pause ${(e.gap / 1000).toFixed(1)} s, then type` : 'typing';
  } else if (e.k === 'back') {
    tail().text = tail().text.slice(0, -1);
    if (!tail().text) segs.pop();
    label = 'typo noticed: Backspace';
  } else if (e.k === 'paste') {
    segs.push({ text: e.text, paste: true });
    label = `copied from the editor: Ctrl+V (after ${(e.gap / 1000).toFixed(1)} s)`;
  }
  strip.push({ t, k: e.k });
  frames.push({ t, segs: segs.map(s => ({ ...s })), label });
}
const end = t + 3500;
frames.push({ t: end, segs: [], label: '' });

const W = 960, H = 250, X0 = 40, X1 = W - 40;
const pct = ms => (ms / end * 100).toFixed(3);
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let css = '';
let body = '';
for (let i = 0; i < frames.length - 1; i++) {
  const a = pct(frames[i].t), b = pct(frames[i + 1].t);
  const a2 = (Number(a) + 0.001).toFixed(3), b2 = (Number(b) + 0.001).toFixed(3);
  css += `@keyframes f${i}{0%,${a}%{opacity:0}${a2}%,${b}%{opacity:1}${b2}%,100%{opacity:0}}.f${i}{animation:f${i} ${end}ms infinite}\n`;
  const text = frames[i].segs.map(s => s.paste ? `<tspan class="paste">${esc(s.text)}</tspan>` : esc(s.text)).join('');
  body += `<g class="fr f${i}"><text class="field" x="${X0 + 16}" y="104">${text}<tspan class="caret">|</tspan></text>`
    + `<text class="label" x="${X0}" y="168">${esc(frames[i].label)}</text></g>\n`;
}
const tx = ms => (X0 + (X1 - X0) * ms / (end - 3500)).toFixed(1);
const ticks = strip.map(s => {
  const cls = s.k === 'back' ? 'tk back' : s.k === 'paste' ? 'tk pst' : 'tk';
  const h = s.k === 'char' || s.k === 'chunk' ? 14 : 26;
  return `<rect class="${cls}" x="${tx(s.t)}" y="${222 - h}" width="${s.k === 'paste' ? 4 : 2}" height="${h}" rx="1"/>`;
}).join('');
css += `@keyframes ph{0%{transform:translateX(0)}${pct(end - 3500)}%,100%{transform:translateX(${X1 - X0}px)}}.ph{animation:ph ${end}ms linear infinite}\n`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="human-typing replaying a real plan: uneven keystrokes, a typo fixed with Backspace and an identifier pasted from the clipboard">
<title>human-typing demo (seed ${seed})</title>
<style>
:root{--bg:#ffffff;--card:#f6f8fa;--line:#d0d7de;--fg:#1f2328;--mute:#59636e;--paste:#9a6700;--pastebg:#fff8c5;--back:#cf222e;--accent:#0969da}
@media (prefers-color-scheme: dark){:root{--bg:#0d1117;--card:#161b22;--line:#30363d;--fg:#e6edf3;--mute:#9198a1;--paste:#e3b341;--pastebg:#3b2e00;--back:#ff7b72;--accent:#4493f8}}
text{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace}
.field{font-size:19px;fill:var(--fg)}
.paste{fill:var(--paste);font-weight:600}
.caret{fill:var(--accent)}
.label{font-size:15px;fill:var(--mute)}
.small{font-size:13px;fill:var(--mute)}
.tk{fill:var(--mute)}.tk.back{fill:var(--back)}.tk.pst{fill:var(--paste)}
.fr{opacity:0}
${css}</style>
<rect width="${W}" height="${H}" rx="12" fill="var(--bg)" stroke="var(--line)"/>
<text class="small" x="${X0}" y="40">Claude in Chrome &#183; comment box &#183; default settings &#183; seed ${seed} &#183; ${p.events.length} keystrokes in ${((end - 4100) / 1000).toFixed(1)} s</text>
<rect x="${X0}" y="66" width="${X1 - X0}" height="60" rx="8" fill="var(--card)" stroke="var(--line)"/>
${body}<g>${ticks}</g>
<line x1="${X0}" x2="${X1}" y1="223" y2="223" stroke="var(--line)"/>
<rect class="ph" x="${X0 - 1}" y="190" width="2" height="38" fill="var(--accent)"/>
<text class="small" x="${X1}" y="244" text-anchor="end">grey: key &#183; red: Backspace &#183; amber: paste</text>
</svg>
`;
writeFileSync(out, svg);
console.log(`wrote ${out instanceof URL ? out.pathname : out}: ${frames.length - 1} frames, ${end} ms loop`);
