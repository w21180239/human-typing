# Calibration and the probe page

## Defaults

The defaults model a fluent non-native English typist who types all day (for example an engineer who writes English at work every day). Reference: Dhakal et al., CHI 2018, 136M keystrokes from 168,960 people: mean 51.56 WPM (SD 20.2), mean IKI 239 ms; typists above ~78 WPM average IKI 122 ms. The paper has no native vs non-native split (85% of its sample is native English), so second-language effects are modelled, not fitted: common words stay fast; long uncommon words (7+ letters, not in the common-word list) start 1.35x slower, type 1.12x slower, draw 2.5x more thinking pauses and 1.4x more typos.

On a 150-character business sentence over 500 seeds the defaults give effective 60 WPM (p10-p90 55-66), 1.08 keystrokes per character, Backspace 3.7% of keypresses, about 3.5 visible corrections per sentence. Dhakal et al. report Backspace/Delete at 6.3% of keypresses on average (KSPC 1.173), 9.05% for typists under 26 WPM and 3.4% above 78 WPM; `--typo 0.03` gives 5.3%. The 0.02 default sits between the average and fast typists, set by user preference within the measured range.

Effective speed scales roughly linearly with `--wpm`; `--wpm 75` gives about 52 WPM.

## Typing model

Typo kinds: neighbour key on QWERTY (letters slip only to letters), transposed pair, doubled letter. An error is noticed after 0-2 more letters (200-600 ms pause), then backspaced and retyped. Faster: common bigrams (th, er, in...), doubled letters. Slower: word starts, shifted capitals, digits, symbols; extra pause after `,;:`, longer after `.!?`, 0.5-1.5 s after a line break.

A pasted span: pause 1.5-5 s (switch window, find, copy, switch back), in-page `navigator.clipboard.writeText` and Ctrl+V in the same batch, then 0.3-1 s before typing resumes. Typos, transpositions and re-typed words never cross into a span. The clipboard write sits right before Ctrl+V because a write one agent turn earlier lost the race when the user copied something meanwhile (2026-11-13).

CJK text cannot go key by key (it needs an IME): it is sent as 1-3 character chunks with 0.35-1.1 s between them.

## Backend costs

Measured 2026-11-13 on a Windows 11 desktop (Chrome stable) against the probe page:
- Claude in Chrome: per-action floor ~18 ms; Backspace costs the same as a letter; waits land median +10 ms, max +20 ms vs plan over 48 gaps.
- Browser MCP: letters floor ~50 ms (+10 to +20 ms vs plan); `press Backspace` blocks ~470 ms after the key, so consecutive backspaces sit at least ~530 ms apart. The planner accounts for it; corrections just look slower.
- Both produce `isTrusted` keydown, input and paste events; pastes arrive as `inputType: insertFromPaste`.

## Recalibrate

`node <skill>/scripts/humantype.mjs serve` serves `http://127.0.0.1:8765/`, which logs every keydown and paste. Type into its box, then read `window.__summary()`: `allTrusted`, `value`, `gaps` (ms between keydowns), `pastes`, `pasteInputs` (count of `insertFromPaste`). Compare `gaps` with `plan ... --timeline` gaps (skip the first). A consistent offset means the floor changed: pass `--overhead MS` or update `ADAPTERS` in the script.
