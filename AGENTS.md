# Notes for coding agents

## Layout

| Path | What |
| --- | --- |
| `plugins/human-typing/skills/human-typing/scripts/humantype.mjs` | The whole product: span detection, planner, renderers, CLI. No dependencies |
| `plugins/human-typing/skills/human-typing/SKILL.md` | What the agent follows at run time |
| `plugins/human-typing/skills/human-typing/references/` | Calibration data and the strong-mode marker brief (`{{CANDIDATES}}`, `{{OUT}}`, `{{TEXT}}` are filled by `brief`) |
| `plugins/human-typing/agents/` | `span-marker` and `typing-runner` subagents |
| `.claude-plugin/marketplace.json`, `plugins/human-typing/.claude-plugin/plugin.json` | Claude Code plugin manifests |
| `tests/` | `node:test` suites; `tests/fixtures/spans*.json` are the labelled span corpora |
| `tools/span-eval.mjs` | Scores light mode against a corpus |
| `tools/make-demo-svg.mjs` | Regenerates `repo-assets/demo.svg` from a real plan |

## Checks

```sh
npm test       # all suites, about a second
npm run eval   # both span corpora: exact, precision, recall
```

CI runs both on Linux, macOS and Windows with Node 18, 20 and 22, and fails if `package.json`, `plugin.json` and `humantype --version` disagree.

## Rules

- The script stays dependency-free, ASCII-only and runnable on Node 18.
- A plan must reproduce the text exactly (`plan` throws otherwise) and must never contain Enter-to-submit or a click.
- A clipboard write and its paste key stay in one batch.
- Changing light-mode rules: run `npm run eval` before and after and report both lines. `tests/fixtures/spans.json` must stay at full exact match; the holdout must stay at precision 0.95 and recall 0.9 or better. Do not tune rules against holdout cases without saying so.
- Changing timing defaults: update `references/calibration.md` and `docs/en/TYPING-MODEL.md` with the new measured numbers.
- Bump the version in `package.json`, `plugin.json` and the `USAGE` string together, and add a `docs/en/CHANGELOG.md` section.
