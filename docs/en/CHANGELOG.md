# Changelog

## 0.1.0

First public release.

- Keystroke planner: per-key log-normal timing with bigram, word-start, Shift, digit and punctuation adjustments; thinking pauses; neighbour-key, swapped and doubled-letter typos fixed with Backspace; occasional re-typed words; CJK sent in IME-sized chunks.
- Renders plans for Claude in Chrome (`browser_batch` actions) and Browser MCP (command lines), with each backend's measured per-action floor subtracted.
- Span modes: `light` (default, rules only), `strong` (a Haiku subagent marks spans, checked against the original with exit code 3) and `off`.
- Light rules cover identifiers, calls, member chains, paths including Windows paths with spaces, URLs and `host/path`, hashes, UUIDs, versions, `KEY=value`, scoped packages, long flags, quoted error messages and log lines. Held-out corpus: precision 0.97, recall 0.94.
- A clipboard write and its Ctrl+V always land in the same batch; `clip save` / `clip restore` keep the user's clipboard.
- `verify` reads the focused field back and reports `MATCH`, `MATCH_WS` or the first difference.
- `serve` hosts a local probe page for recalibration.
- Claude Code plugin with `span-marker` and `typing-runner` subagents; npm package `humantype`.
