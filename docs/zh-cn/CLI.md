# CLI 参考

`humantype` 是一个无依赖的 Node 脚本（Node 18 或更高）。用 `npm install -g humantype` 安装，或者直接运行 skill 里自带的那份：`node plugins/human-typing/skills/human-typing/scripts/humantype.mjs`。

它从不打开浏览器。`plan` 写出按键 plan；`batch` 和 `verify` 打印工具输入，由 agent 原样发送给 Claude in Chrome 或 Browser MCP。

## 命令

| 命令 | 输出 |
| --- | --- |
| `humantype spans "<text>" [--paste-min 8]` | JSON：每个 light 模式候选，含 `text`、`reason` 和 `paste`，以及把被粘贴的 span 用 `[[ ]]` 包起来的文本 |
| `humantype brief --text-file PATH --out PATH` | strong 模式 marker 的 prompt；规则一个都没找到时输出 `NO_CANDIDATES` |
| `humantype plan "<text>" --target chrome\|browsermcp [flags]` | JSON 格式的 plan；加 `--out` 时只输出它的 `meta` 行 |
| `humantype batch PLAN.json N` | 第 `N` 批（从 0 开始）：Chrome 是一个 `browser_batch` actions 的 JSON 数组，Browser MCP 是命令行 |
| `humantype verify PLAN.json` | 输入框检查：Chrome 是 `javascript_tool` 的输入，Browser MCP 是一条 `eval` 命令 |
| `humantype clip save` / `clip restore` | 把系统剪贴板存到临时文件 / 放回去并删除该文件 |
| `humantype serve [--port 8765]` | 在 `127.0.0.1` 上提供探测页，记录每个 keydown 间隔和 paste |
| `humantype help`、`humantype --version` | 用法、版本 |

`plan`、`spans` 和 `brief` 的文本可以作为第一个参数，也可以来自 `--text-file PATH`。文件末尾的换行会被忽略，CRLF 会变成 LF。

## Plan flag

| Flag | 默认值 | 作用 |
| --- | --- | --- |
| `--target` | 必填 | `chrome`（Claude in Chrome）或 `browsermcp`（Browser MCP） |
| `--tab` | chrome 必填 | 来自 `tabs_context_mcp` 的 tab id |
| `--mode` | `light` | `light`：由规则挑选被粘贴的 span。`strong`：文本带有 marker 标出的 `[[ ]]`。`off`：全部手敲 |
| `--orig-file` | 无 | strong 模式：若标记后的文本在标记之外的任何地方与此文件不同，则以 3 退出 |
| `--newline` | 无 | `enter`（Enter 换行）或 `shift`（Shift+Enter，用于按 Enter 就提交的输入框）。文本含换行时必填 |
| `--wpm` | 86 | 连击速度，每词 5 个字符。有效速度约为它的 70% |
| `--typo` | 0.02 | 每个字母的打错概率；词首 x1.6，长的生僻词 x1.4 |
| `--think` | 0.03 | 词前出现 0.5-1.8 s 停顿的概率；长的生僻词前 x2.5 |
| `--retype` | 0.01 | 删掉刚打完的词并重打的概率 |
| `--paste-min` | 8 | light 模式粘贴的标识符或调用的最短长度 |
| `--seed` | 时间 | 固定随机选择，得到可复现的 plan |
| `--chunk` | 150 | 每批最多的 action 数（Chrome）或行数（Browser MCP）。剪贴板写入和它的 Ctrl+V 永远不会被拆开 |
| `--overhead` | 随 target | 单次操作的下限，单位 ms，从每个间隔里减掉。实测：Chrome ~18，Browser MCP ~50 |
| `--out` | stdout | 把 plan 写入文件，只打印 `meta` |
| `--timeline` | 关 | 打印 `{ meta, events }` 而不是批次：每个事件有 `k`（`char`、`back`、`paste`、`chunk`）和 `gap`，即它之前的 ms 数 |

`meta` 包含 `seed`、`target`、`batches`、`keystrokes`、`backspaces`、`pastes`（被粘贴的字符串）、`totalSec` 和 `longPauses`（700 ms 及以上的间隔）。

## 退出码

| 退出码 | 含义 |
| --- | --- |
| 0 | 完成 |
| 2 | 用法错误：缺少 `--target` 或 `--tab`，未知的 `--mode`，有换行但没有 `--newline`，批次序号超出范围 |
| 3 | strong 模式：标记后的文本在标记之外与 `--orig-file` 不同。重新标记一次，再不行就退回 light |

## 校验结果

检查会读取聚焦的元素（input 和 textarea 读 `value`，contenteditable 读 `innerText`），并返回：

- `MATCH`：完全一致。
- `MATCH_WS`：把空白折叠后相等。contenteditable 编辑器对换行的报告方式不同；视为完成。
- `DIFF at i: got "..." want "..."`：从第一处差异开始的 30 个字符。本该是代码 span 的位置出现了错误的词，说明页面内的剪贴板写入失败，Ctrl+V 粘贴的是旧剪贴板。

## 剪贴板

`clip save` 和 `clip restore` 在 Windows 上用 PowerShell 的 `Get-Clipboard`/`Set-Clipboard`，macOS 上用 `pbpaste`/`pbcopy`，Linux 上用 `xclip`（需先安装）。保存的副本放在系统临时目录里，文件名为 `humantype-clip-saved.txt`，恢复时删除。没有保存过就 `restore`，什么也不会发生。

## 作为库使用

这个脚本同时也是一个 ES module：

```js
import { detectSpans, plan, render } from 'humantype';

const spans = detectSpans(text).filter(s => s.paste);
const p = plan(text, { seed: 7, spans });          // p.events, p.final === text
const batches = render(p.events, 'browsermcp');    // string per batch
```
