# @Claude — personal Discord bot for `claude -p`

A tiny, personal Discord bot. Mention it (`@Claude do X`) and it runs `claude -p`
inside an `instance/` directory, then replies in the channel. Attach files and
they're handed to Claude; if Claude produces files, they come back as Discord
attachments. Use Claude from your phone, your couch, anywhere.

## How it works

```
You ───@Claude + maybe attachments──▶  bot
                                        │  saves attachments → instance/files/
                                        │  runs:  claude -p  (cwd = instance/)
                                        │  reads  instance-return/ for output files
                                        ▼
You ◀──── reply text + attachments ──── bot
```

- **`instance/`** — Claude's working directory. Holds a `.claude/` folder with
  custom skills (`share-file`, `chat-reply`) and a `CLAUDE.md` that teaches
  Claude the chat conventions.
- **`instance/files/`** — incoming Discord attachments land here (wiped each msg).
- **`instance-return/`** — Claude writes files here to send them back (wiped each msg).
- **Conversation memory** — by default, follow-ups in the same channel resume the
  same Claude session. Say `/reset` (or `/new`) to start fresh.

## Setup

1. **Create the bot** at <https://discord.com/developers/applications> → *New
   Application* → *Bot*. Copy the **token**.
2. Under *Bot*, enable the **Message Content Intent** (required to read your
   messages).
3. **Invite it** to a server: *OAuth2 → URL Generator*, scopes `bot`, permissions
   *Send Messages*, *Read Message History*, *Attach Files*. Open the URL, add it.
   (Or just DM the bot — DMs work too.)
4. **Configure** the project:
   ```bash
   pnpm install
   cp .env.example .env       # then edit .env
   ```
   Set `DISCORD_TOKEN`, and set `OWNER_USER_ID` to your own Discord user ID so
   only you can use it. (Enable Developer Mode in Discord → right-click your
   name → *Copy User ID*.)
5. **Run it:**
   ```bash
   pnpm start
   ```

## Usage

- `@Claude summarize this` + a `.txt` attachment → Claude reads `files/…` and replies.
- `@Claude make me a 3-slide deck about otters` → Claude writes the file to
  `instance-return/` and you get it as an attachment.
- In a DM, you don't even need the mention — just type.

### Commands

Set defaults in `.env`; override per-channel at runtime (handy from your phone):

| Command | What it does |
| --- | --- |
| `/model <alias\|id>` | Set model: `opus`, `sonnet`, or a full id like `claude-opus-4-8`. No arg resets to default. |
| `/effort <low\|medium\|high\|xhigh\|max>` | Set reasoning effort (Sonnet/Opus only). No arg resets. |
| `/config` | Show this channel's current model, effort, conversation state, permission mode. |
| `/reset` (or `/new`) | Forget the conversation and start a fresh Claude session. |
| `/help` | List commands. |

Env defaults: `CLAUDE_MODEL` and `CLAUDE_EFFORT` in [.env.example](.env.example).
Effort is silently dropped for models that don't support it (e.g. Haiku).

## Notes & safety

- `CLAUDE_PERMISSION_MODE` defaults to **`bypassPermissions`** so Claude can
  actually use its tools without an interactive prompt (the whole point of a
  remote bot). That means Claude can run commands and edit files on the machine
  hosting the bot. **Keep `OWNER_USER_ID` set** and run it somewhere you trust.
- Only one Claude run happens at a time (single instance dir); extra messages
  queue up.
- Replies over 2000 chars are split; very long ones are sent as `response.md`.
  Return files over 8 MB (Discord's default cap) are skipped with a console warning.

## Config reference

See [.env.example](.env.example) — token, owner lock, `claude` binary path,
permission mode, timeout, and session persistence toggle.
