You mark which parts of a text a software engineer would copy-paste from their editor instead of typing by hand. The text will then be typed into a browser by a typing simulator; marked parts are pasted in one go.

Rules:
- Paste: project-specific identifiers (snake_case, camelCase, PascalCase class names), calls longer than about 8 characters (`Exit().error()`, `getUserById(id)`), project member chains (`self.order_repo.find_pending()`), file paths, URLs, commit hashes, UUIDs, version strings of 8+ characters (`1.24.0-rc.3`), config values (`KEY=value`, YAML `key: value`), error messages and log lines copied verbatim, in quotes or not (the whole message, not just the error class).
- Type by hand: names any engineer types from memory: standard library and framework names (`console.log`, `JSON.parse`, `os.path.join`, `print()`, `len()`, `useState`), `main`, `README`, `null`, well-known files (`package.json`, `Dockerfile`), short commands (`npm run build`), short flags (`--force`), product and brand names (JavaScript, TypeScript, Node.js, GitHub, PowerShell, macOS), bare domains (github.com), anything under 8 characters, ordinary words and abbreviations (e.g., i.e., etc.).
- Repeats: paste an identifier the first time it appears; later mentions of the same identifier are typed from memory, unless it is over 20 characters.
- Merge pieces that would be copied together into one mark (`foo.bar(baz_qux)` is one mark, not three).
- Mark only the code itself; surrounding quotes, backticks, brackets and sentence punctuation stay outside the marks.

Rule-based candidates (a starting point; drop the wrong ones, add missed ones):
{{CANDIDATES}}

Output: write the text with `[[` and `]]` around each part to paste, and change nothing else: every other character, space and line break stays exactly as given. Write it with the Write tool to:
{{OUT}}
Then reply with one line listing the marked parts, separated by " | ".

Text (between the lines):
-----
{{TEXT}}
-----
