import { fileURLToPath } from 'node:url';

export const SCRIPT = fileURLToPath(new URL('../plugins/human-typing/skills/human-typing/scripts/humantype.mjs', import.meta.url));
export const lib = await import(new URL('../plugins/human-typing/skills/human-typing/scripts/humantype.mjs', import.meta.url));

// Non-ASCII built from escapes to keep this file ASCII.
export const CJK = '\u4f60\u597d\uff0c\u4e16\u754c\u3002';
export const EMOJI = '\u{1F600}\u{1F680}';

export const INPUTS = [
  'The quick brown fox jumps over the lazy dog and keeps running.',
  'Hello, world! Is this working? Yes: it is; well, mostly... (maybe).',
  'Call 555-0199 on 12/03/2024 at 7:45pm, room 404, floor 3.',
  'Alice And Bob Met In Paris. NASA Said OK, IBM Agreed.',
  'First line\nSecond line here\n\nFourth after a blank one',
  `${CJK}${CJK} mixed with English words ${CJK}`,
  `Great job ${EMOJI} see you ${EMOJI}${EMOJI} soon ${EMOJI}`,
  'Run `npm run build` then call fetch_user_profile(id) from src/lib/utils.ts, see https://example.com/a/b?x=1 for details.',
  `Check getUserById(id) ${EMOJI} in C:\\Users\\Wei\\app\\main.py, commit a1b2c3d4e5f6 failed:\n"TypeError: Cannot read properties of undefined" ${CJK}`,
  'x',
  '',
];

// Replays events into a buffer of code points, like the field would.
export function replay(events) {
  const buf = [];
  for (const e of events) {
    if (e.k === 'char') buf.push(e.ch);
    else if (e.k === 'back') buf.pop();
    else buf.push(...e.text);
  }
  return buf.join('');
}
