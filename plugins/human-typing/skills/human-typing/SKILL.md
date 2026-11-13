---
name: human-typing
description: Use when text must be typed into the user's Chrome the way a person types it, through Claude in Chrome (mcp__claude-in-chrome__*) or Browser MCP (mcp__browsermcp__browser) - "type slowly", "human-like typing", "type it like I would", "模拟手打", "慢慢输入", or a typing task where instant fill or paste would look automated. Not for plain form filling where speed does not matter (use fill / form_input).
allowed-tools: Bash(node *humantype.mjs*), Bash(humantype *)
---

# Human typing

`scripts/humantype.mjs` (Node 18+, no dependencies) turns a text into a keystroke plan - uneven per-key timing, thinking pauses, typos fixed with Backspace, code identifiers pasted from the clipboard - and renders it as ready-to-send browser tool input. You send the output unchanged; the planner never touches the browser.

`H` = `node <skill>/scripts/humantype.mjs` (or `humantype` when installed from npm). `S` = a fresh folder in the scratchpad.

## Before planning: three decisions

**Backend.** Claude in Chrome when available (fast per action, accurate waits); Browser MCP otherwise (corrections look slower, see `references/calibration.md`). Chrome needs the tab id: `tabs_context_mcp`, or `tabs_create_mcp` for a new tab.

**Line breaks.** If the text contains a line break, check what Enter does in the target field:

| field | flag |
|---|---|
| Enter adds a line (plain textarea, code editor, most comment boxes) | `--newline enter` |
| Enter sends or submits (chat box, message composer, search, single-line input) | `--newline shift` |
| single-line `<input>` | remove the line breaks from the text first |

Unsure: `--newline shift`, which adds a line in a chat box and does nothing harmful in a textarea. `plan` exits 2 when the text has a line break and no `--newline`.

**Span mode.** Which code spans are pasted instead of typed:

| mode | when | cost |
|---|---|---|
| `light` (default) | always, unless the user asks for strong | rules only, no model call |
| `strong` | the user asks for it ("strong mode", "let the model judge the spans") | one small-model call (step 2) |
| `off` | the user wants every character typed | none |

## Steps

1. Write the exact text to `S/orig.txt`. A trailing newline in the file is ignored.
2. Strong mode only: `H brief --text-file S/orig.txt --out S/marked.txt > S/brief.txt`.
   - Prints `NO_CANDIDATES`: continue in light mode.
   - Otherwise run the marker on a small model, never the main one: `Agent(subagent_type: "human-typing:span-marker", model: "haiku", prompt: "Read S/brief.txt and do exactly what it says.")`. If that agent type is not listed, use `general-purpose` with the same model and prompt. It writes `S/marked.txt`. No Agent tool (you are a subagent): continue in light mode.
3. Plan:
   ```
   H plan --text-file S/orig.txt --target chrome --tab <id> [--newline enter|shift] --out S/plan.json
   H plan --text-file S/orig.txt --target browsermcp [--newline enter|shift] --out S/plan.json
   ```
   Strong mode: replace `--text-file S/orig.txt` with `--text-file S/marked.txt --mode strong --orig-file S/orig.txt`. Off: add `--mode off`.
   Prints `meta`: `batches`, `totalSec`, `pastes`. Exit 3 (strong) = the marker changed the text: rerun step 2 once, then fall back to light.
4. If `meta.pastes` is non-empty: `H clip save`. Pastes overwrite the clipboard; step 7 puts it back.
5. Focus the field. Chrome: `find` (`query` = the field's label, `tabId`), then `computer` `left_click` with its `ref`. Browser MCP: `click <target>`, e.g. `click getByLabel('Comment')` or `click getByRole('textbox', { name: 'Message' })`. The plan types into whatever has focus, and `verify` reads the focused element, so make no clicks, screenshots or other calls in that tab until step 7 is done.
6. For N = 0 .. batches-1, run `H batch S/plan.json N` and send the printed output unchanged as one call:
   - Chrome: the printed JSON array is the `actions` of `mcp__claude-in-chrome__browser_batch` (items are already `{name, input}`).
   - Browser MCP: the printed lines are the `commands` of `mcp__browsermcp__browser`.
7. If step 4 ran: `H clip restore`, also when a batch failed. Then `H verify S/plan.json` and send its output: Chrome as the input of `mcp__claude-in-chrome__javascript_tool`, Browser MCP as the `commands` of `mcp__browsermcp__browser`.
   - `MATCH`: done.
   - `MATCH_WS` (contenteditable reports line breaks differently): done.
   - `DIFF at i ...`: report the excerpt; fix by hand only on request. A wrong word in place of a code span means the in-page clipboard write failed and Ctrl+V pasted the old clipboard.

The plan never presses Enter to submit and never clicks send. Submitting is a separate step that needs the user's go.

With 3 or more batches, hand steps 4-7 to a subagent on a small model (`human-typing:typing-runner` if listed, else `general-purpose`; model haiku) with the exact commands, so batch JSON stays out of the main context.

## Which spans are pasted

An engineer copies identifiers from the editor instead of typing them. `H spans "<text>"` shows what light mode finds and why.

- Pasted: project identifiers of 8+ characters (snake_case, camelCase, PascalCase, `UPPER_SNAKE`), calls, member chains, file paths (Windows paths with spaces too), URLs and `host/path`, commit hashes, UUIDs, versions of 8+ characters, `KEY=value`, scoped packages, flags of 14+ characters, quoted error messages and log lines (whole), backtick spans of 8+ characters.
- Typed: standard-library names (`console.log`, `os.path.join`, `JSON.parse`), framework hooks (`useState`), brand names (TypeScript, Node.js, macOS), well-known files (`package.json`, `README.md`), bare domains, short commands (`npm run build`), anything under `--paste-min` (8), and a repeat mention (or a name already pasted inside a longer span) unless it is over 20 characters.

Strong mode adds judgement the rules lack, such as an unquoted error message or a YAML `key: value`. Light mode scores 0.97 precision and 0.94 recall on a held-out corpus (`node tools/span-eval.mjs` in the repository).

Page JS runs only to write the clipboard right before Ctrl+V. The typing itself always goes through the tools' real key events, which arrive as `isTrusted`; events dispatched from page JS are untrusted and many controlled inputs ignore them.

## Knobs

| flag | default | effect |
|---|---|---|
| `--mode` | light | `light` rules, `strong` `[[...]]` marks from the marker, `off` types everything |
| `--wpm` | 86 | burst speed (5 chars = 1 word); effective speed after pauses and fixes is ~70% of it |
| `--typo` | 0.02 | per-letter typo chance; x1.6 at word starts, x1.4 in long uncommon words |
| `--think` | 0.03 | chance of a 0.5-1.8 s pause before a word; x2.5 before long uncommon words |
| `--retype` | 0.01 | chance to delete a finished word and type it again |
| `--newline` | none | `enter` or `shift`; required when the text has a line break |
| `--seed` | time | fix for a reproducible run |
| `--chunk` | 150 | max actions/lines per batch |
| `--paste-min` | 8 | shortest identifier/call light mode pastes |
| `--orig-file` | none | strong: exit 3 if the marked text differs from this file outside the marks |
| `--out` | stdout | write the plan to a file, print only `meta` |
| `--overhead` | per target | override the measured per-action floor in ms |
| `--timeline` | off | print raw events (`gap` = ms before each key) instead of batches |

Defaults model a fluent second-language English typist at about 60 WPM effective with ~3.5 corrections per 150 characters. For a slower or faster persona change `--wpm` alone. Data behind the defaults, the typing model, backend timings and the probe page for recalibration: `references/calibration.md`.

## Common mistakes

| mistake | result |
|---|---|
| `--newline enter` in a chat box | the first line is sent mid-typing |
| clicking or screenshotting the tab between batches | focus moves; the rest types elsewhere or nowhere |
| editing, merging or splitting batch output | a clipboard write separated from its Ctrl+V pastes whatever the user copied last |
| skipping `clip restore` after a failure | the user's clipboard holds the last pasted span |
| strong mode by default, or judging spans in the main session | costs model tokens the light rules do not need |
