---
name: share-file
description: Deliver a file to the user over Discord. Use whenever the user asks you to send, export, generate, or hand back a file (image, document, archive, code dump, screenshot, etc.) through this chat.
---

# share-file

This instance is bridged to Discord. To get a file into the user's chat:

1. Write (or copy) the finished file into `../instance-return/`.
2. Use a clear, human-friendly filename — it's exactly what the user sees as the
   attachment name (e.g. `invoice-june.pdf`, not `tmp123.pdf`).
3. Mention in your reply what you sent.

Notes:
- Multiple files are fine — drop them all in `../instance-return/`.
- Keep each file under 8 MB (Discord's default upload limit); larger files are
  skipped and won't be delivered. Compress or split if needed.
- The directory is emptied after every message, so only place files there that
  belong to the current reply.

Example:
```bash
cp build/report.pdf ../instance-return/report.pdf
```
Then tell the user: "Sent you `report.pdf`."
