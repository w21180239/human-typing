# Contributing

The most useful reports are sentences where light mode got it wrong: it pasted something you would type, or typed something you would copy from your editor. Open an issue with the sentence (or a synthetic stand-in) and what you expected, or add it straight to `tests/fixtures/spans.json`.

Timing reports are welcome too. Run `humantype serve`, type a plan into the probe page and include `window.__summary()` with your OS, Chrome version and backend.

## Pull requests

1. Fork, branch from `main`, keep the change to one topic.
2. Run the checks CI runs:

   ```sh
   npm test
   npm run eval
   ```

3. Add or update a test for any behaviour change. A rule change reports `npm run eval` before and after; higher recall that costs precision on either corpus needs a reason.
4. Note user-visible changes in `docs/en/CHANGELOG.md`.

## Scope

- One script, no dependencies, Node 18 or later.
- Real key events through the browser tool. Page JavaScript only writes the clipboard right before a paste.
- The plan never submits a form or clicks.
- No claims about getting past bot detection. Report measured numbers with the method.

## Licence

Contributions are dual-licensed under MIT and Apache-2.0, the same as the project.
