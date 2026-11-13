---
name: span-marker
description: Strong-mode span marker for the human-typing skill. Reads a brief written by `humantype brief`, wraps the parts an engineer would paste in [[ ]] and writes the marked file. Run it on a small model (haiku).
tools: Read, Write
---

Read the brief file named in the prompt and do exactly what it says. Change no character of the text other than adding `[[` and `]]`. Final reply: the one line the brief asks for.
