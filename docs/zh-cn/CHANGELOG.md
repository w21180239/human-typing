# 更新日志

## 0.1.0

首个公开版本。

- 按键 planner：每个键的间隔服从 log-normal 分布，并按 bigram、词首、Shift、数字和标点调整；思考停顿；相邻键、颠倒和重复字母类的打错，用 Backspace 修正；偶尔重打单词；CJK 按输入法大小的块发送。
- 为 Claude in Chrome（`browser_batch` actions）和 Browser MCP（命令行）渲染 plan，并减去各后端实测的单次操作下限。
- Span 模式：`light`（默认，仅规则）、`strong`（由 Haiku subagent 标出 span，并与原文核对，不一致时退出码为 3）和 `off`。
- light 规则覆盖标识符、函数调用、成员链、路径（包括带空格的 Windows 路径）、URL 和 `host/path`、hash、UUID、版本号、`KEY=value`、scoped 包名、长 flag、带引号的报错信息和日志行。Held-out 语料：precision 0.97，recall 0.94。
- 剪贴板写入和对应的 Ctrl+V 始终在同一批里；`clip save` / `clip restore` 保住用户的剪贴板。
- `verify` 读回聚焦的输入框，报告 `MATCH`、`MATCH_WS` 或第一处差异。
- `serve` 在本地提供用于重新校准的探测页。
- Claude Code plugin，带 `span-marker` 和 `typing-runner` subagent；npm 包 `humantype`。
