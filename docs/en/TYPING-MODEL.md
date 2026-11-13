# Typing model

The planner turns text into a timeline of events, each with `gap`, the milliseconds to wait before it. `humantype plan ... --timeline` prints it.

## Who the defaults model

A fluent second-language English typist who types all day, for example an engineer who writes English at work. The reference is Dhakal et al., *Observations on Typing from 136 Million Keystrokes*, CHI 2018 (168,960 participants):

| Measure | Dhakal et al. | human-typing defaults |
| --- | --- | --- |
| Speed | mean 51.56 WPM (SD 20.2) | 60 WPM effective (p10-p90 55-66) |
| Inter-key interval | mean 239 ms; 122 ms above ~78 WPM | burst 140 ms at 86 WPM, slower at word starts |
| Backspace share of keypresses | 6.3% overall, 9.05% under 26 WPM, 3.4% above 78 WPM | 3.7% |
| Keystrokes per character | 1.173 | 1.08 |

Defaults measured over 500 seeds on a 150-character business sentence. The paper has no native versus non-native split (85% of its sample is native English), so second-language effects are modelled rather than fitted: common words stay fast, while long uncommon words (7+ letters, not in the common-word list) start 1.35x slower, type 1.12x slower, draw 2.5x more thinking pauses and 1.4x more typos.

`--typo 0.03` gives Backspace at 5.3%, close to the study average. Effective speed scales roughly linearly with `--wpm`: `--wpm 75` gives about 52 WPM.

## Per-key timing

Each gap is drawn from a log-normal around the burst interval (`60000 / (wpm * 5)` ms), then adjusted:

| Condition | Effect |
| --- | --- |
| Common bigram (th, er, in, ...) | x0.65 |
| Doubled letter | x0.8 |
| Capital letter | +40-110 ms for Shift |
| Digit | x1.3 |
| Symbol | x1.5 |
| Space | x1.1-1.5 |
| First letter of a word | x1.3-2.0 |
| After `,` `;` `:` | extra pause |
| After `.` `!` `?` | longer pause |
| After a line break | 0.5-1.5 s |

## Mistakes and corrections

A typo is a QWERTY neighbour key (letters slip only to letters), a swapped pair or a doubled letter. The typist notices it after 0-2 more letters, pauses 200-600 ms, backspaces and retypes. With `--retype` chance a finished word is deleted and typed again, and with `--think` chance a word is preceded by a 0.5-1.8 s pause. None of these cross into a pasted span.

## Pasted spans

A paste waits 1.5-5 s (switch to the editor, find the name, copy, switch back), writes the span to the clipboard from page JavaScript, presses Ctrl+V (Cmd+V when the planner runs on macOS; not yet tested there) in the same batch, then waits 0.3-1 s before typing resumes. The clipboard write sits right before the paste key because a write one agent turn earlier lost the race when the user copied something in between.

## CJK text

Chinese, Japanese and Korean go through an IME, so they cannot be sent key by key. They are sent as 1-3 character chunks with 0.35-1.1 s between chunks.

## Backend costs

Every browser action has a floor: the time the tool itself takes. The planner subtracts it from each gap so the page sees the planned timing.

| | Claude in Chrome | Browser MCP |
| --- | --- | --- |
| Per-action floor | ~18 ms | ~50 ms for letters |
| Wait accuracy | median +10 ms, max +20 ms vs plan (48 gaps) | +10 to +20 ms vs plan |
| Backspace | same as a letter | `press Backspace` blocks ~470 ms, so consecutive backspaces sit at least ~530 ms apart |

Both produce `isTrusted` keydown, input and paste events; pastes arrive as `inputType: insertFromPaste`. Measured on a Windows 11 desktop with Chrome stable.

## Recalibrate

1. `humantype serve` serves `http://127.0.0.1:8765/`, a text box that logs every keydown and paste.
2. Have the agent type a plan into it.
3. In the page console, `window.__summary()` returns `allTrusted`, `value`, `gaps` (ms between keydowns), `pastes` and `pasteInputs` (count of `insertFromPaste`).
4. Compare `gaps` with the gaps from `humantype plan ... --timeline` (skip the first). A steady offset means the floor changed: pass `--overhead MS`, or update `ADAPTERS` in the script and send a pull request with your numbers.
