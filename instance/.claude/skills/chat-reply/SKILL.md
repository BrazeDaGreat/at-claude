---
name: chat-reply
description: How to format replies for the Discord chat bridge. Use when composing any user-facing answer in this instance to keep responses chat-sized and readable.
---

# chat-reply

You're replying inside a Discord chat, not writing a document.

- **Be concise by default.** A sentence or two is usually right. Expand only
  when the user asks for depth or the task genuinely needs it.
- **Discord markdown renders:** `**bold**`, `*italic*`, `` `inline code` ``,
  triple-backtick code blocks, `>` quotes, and `-` / `1.` lists. Use them.
- **No tables** — Discord doesn't render markdown tables. Use a short list or a
  code block with aligned columns instead.
- **Long output → file.** If you'd produce a wall of text (a big log, a full
  file, lots of data), write it to `../instance-return/` as a file (see the
  `share-file` skill) and give a short summary in the reply instead.
- **Links** are fine as raw URLs; Discord auto-embeds them.
- Don't include your internal reasoning or tool chatter — just the answer.
