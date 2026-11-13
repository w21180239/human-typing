# CLI reference

`humantype` is one Node script with no dependencies (Node 18 or later). Install it with `npm install -g humantype`, or run the copy inside the skill: `node plugins/human-typing/skills/human-typing/scripts/humantype.mjs`.

It never opens a browser. `plan` writes a keystroke plan; `batch` and `verify` print tool input that an agent sends to Claude in Chrome or Browser MCP unchanged.

## Commands

| Command | Prints |
| --- | --- |
| `humantype spans "<text>" [--paste-min 8]` | JSON: every light-mode candidate with `text`, `reason` and `paste`, plus the text with pasted spans wrapped in `[[ ]]` |
| `humantype brief --text-file PATH --out PATH` | The prompt for the strong-mode marker, or `NO_CANDIDATES` when the rules find nothing |
| `humantype plan "<text>" --target chrome\|browsermcp [flags]` | The plan as JSON, or only its `meta` line with `--out` |
| `humantype batch PLAN.json N` | Batch `N` (0-based): a JSON array of `browser_batch` actions for Chrome, command lines for Browser MCP |
| `humantype verify PLAN.json` | A field check: `javascript_tool` input for Chrome, an `eval` command for Browser MCP |
| `humantype clip save` / `clip restore` | Saves the system clipboard to a temp file / puts it back and deletes the file |
| `humantype serve [--port 8765]` | Serves the probe page on `127.0.0.1`, which logs every keydown gap and paste |
| `humantype help`, `humantype --version` | Usage, version |

`plan`, `spans` and `brief` take the text as the first argument or from `--text-file PATH`. A file's trailing newline is ignored and CRLF becomes LF.

## Plan flags

| Flag | Default | Effect |
| --- | --- | --- |
| `--target` | required | `chrome` (Claude in Chrome) or `browsermcp` (Browser MCP) |
| `--tab` | required for chrome | Tab id from `tabs_context_mcp` |
| `--mode` | `light` | `light`: rules pick the pasted spans. `strong`: the text carries `[[ ]]` marks from the marker. `off`: type everything |
| `--orig-file` | none | Strong mode: exit 3 if the marked text differs from this file anywhere outside the marks |
| `--newline` | none | `enter` (Enter adds a line) or `shift` (Shift+Enter, for fields that submit on Enter). Required when the text has a line break |
| `--wpm` | 86 | Burst speed, 5 characters per word. Effective speed is about 70% of it |
| `--typo` | 0.02 | Per-letter typo chance; x1.6 at word starts, x1.4 in long uncommon words |
| `--think` | 0.03 | Chance of a 0.5-1.8 s pause before a word; x2.5 before long uncommon words |
| `--retype` | 0.01 | Chance to delete a finished word and type it again |
| `--paste-min` | 8 | Shortest identifier or call light mode pastes |
| `--seed` | time | Fixes the random choices for a reproducible plan |
| `--chunk` | 150 | Most actions (Chrome) or lines (Browser MCP) per batch. A clipboard write and its Ctrl+V are never split |
| `--overhead` | per target | Per-action floor in ms, subtracted from every gap. Measured: Chrome ~18, Browser MCP ~50 |
| `--out` | stdout | Write the plan to a file and print only `meta` |
| `--timeline` | off | Print `{ meta, events }` instead of batches: each event has `k` (`char`, `back`, `paste`, `chunk`) and `gap`, the ms before it |

`meta` holds `seed`, `target`, `batches`, `keystrokes`, `backspaces`, `pastes` (the pasted strings), `totalSec` and `longPauses` (gaps of 700 ms or more).

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done |
| 2 | Bad usage: missing `--target` or `--tab`, unknown `--mode`, line breaks without `--newline`, a batch index out of range |
| 3 | Strong mode: the marked text differs from `--orig-file` beyond the marks. Re-mark once, then fall back to light |

## Verify results

The check reads the focused element (`value` for inputs and textareas, `innerText` for contenteditable) and returns:

- `MATCH`: identical.
- `MATCH_WS`: equal once whitespace is collapsed. Contenteditable editors report line breaks differently; treat it as done.
- `DIFF at i: got "..." want "..."`: the first 30 characters from the first difference. A wrong word where a code span should be means the in-page clipboard write failed and Ctrl+V pasted the old clipboard.

## Clipboard

`clip save` and `clip restore` use PowerShell `Get-Clipboard`/`Set-Clipboard` on Windows, `pbpaste`/`pbcopy` on macOS and `xclip` on Linux (install it first). The saved copy lives in the system temp folder as `humantype-clip-saved.txt` and is deleted on restore. `restore` with nothing saved does nothing.

## Library use

The script is also an ES module:

```js
import { detectSpans, plan, render } from 'humantype';

const spans = detectSpans(text).filter(s => s.paste);
const p = plan(text, { seed: 7, spans });          // p.events, p.final === text
const batches = render(p.events, 'browsermcp');    // string per batch
```
