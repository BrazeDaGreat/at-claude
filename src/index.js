import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
} from 'discord.js';

import { config, FILES_DIR, RETURN_DIR } from './config.js';
import { runClaude, EFFORT_LEVELS, modelSupportsEffort } from './claudeRunner.js';
import { startAutoText, stopAutoText } from './auto-text.js';

const DISCORD_FILE_LIMIT = 8 * 1024 * 1024; // 8 MB, the default (non-boosted) upload cap
const MAX_MESSAGE_LEN = 2000;

// channelId -> claude session id, for conversation continuity
const sessions = new Map();

// Per-channel model / effort overrides (fall back to env defaults in config).
const channelModel = new Map();
const channelEffort = new Map();

// Serialize runs: there is a single instance dir, so only one claude at a time.
let busy = false;
const queue = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel], // needed to receive DMs
});

client.once('clientReady', async (c) => {
  console.log(`Logged in as ${c.user.tag}. Mention @${c.user.username} to talk to Claude.`);
  try {
    await startAutoText(client, { runExclusive: enqueueJob });
  } catch (err) {
    console.error('Failed to start auto-text scheduler:', err);
  }
});

// This bot is allowed through the bot filter, and may trigger by naming AtClaude.
const ALLOWED_BOT_ID = '1523997466121211905';

client.on('messageCreate', (message) => {
  const isAllowedBot = message.author.id === ALLOWED_BOT_ID;
  if (message.author.bot && !isAllowedBot) return;

  const isDM = !message.guild;
  const mentioned = client.user && message.mentions.has(client.user.id);
  // The allowed bot can also trigger by saying "AtClaude" without a real mention.
  const namedAtClaude = isAllowedBot && /\batclaude\b/i.test(message.content);
  if (!isDM && !mentioned && !namedAtClaude) return;

  if (!isAllowedBot && config.allowedUserIds.size > 0 && !config.allowedUserIds.has(message.author.id)) {
    return; // silently ignore anyone not on the allow-list
  }

  enqueue(message);
});

function enqueue(message) {
  enqueueJob(
    () => handleMessage(message),
    async (err) => {
      console.error('Unhandled error:', err);
      try {
        await message.reply(`⚠️ Something broke: ${truncate(String(err.message || err), 1800)}`);
      } catch {}
    },
  ).catch(() => {});
}

function enqueueJob(run, onError = null) {
  return new Promise((resolve, reject) => {
    queue.push({ run, onError, resolve, reject });
    drain();
  });
}

async function drain() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    const result = await job.run();
    job.resolve(result);
  } catch (err) {
    if (job.onError) {
      try {
        await job.onError(err);
      } catch (handlerErr) {
        console.error('Error handler failed:', handlerErr);
      }
    } else {
      console.error('Unhandled queued job error:', err);
    }
    job.reject(err);
  } finally {
    busy = false;
    drain();
  }
}

async function handleMessage(message) {
  let prompt = stripMention(message.content).trim();

  // c!-prefixed control commands (only when they're the whole message).
  if (prompt.startsWith('c!')) {
    const handled = await handleCommand(message, prompt);
    if (handled) return;
  }

  await freshDir(FILES_DIR);
  await freshDir(RETURN_DIR);

  // Download attachments into instance/files.
  const saved = [];
  for (const att of message.attachments.values()) {
    const safeName = sanitizeName(att.name || `file-${att.id}`);
    const dest = path.join(FILES_DIR, safeName);
    await download(att.url, dest);
    saved.push(safeName);
  }

  if (!prompt && saved.length === 0) {
    await message.reply('👋 Mention me with a question, optionally attaching files.');
    return;
  }

  const fullPrompt = buildPrompt(prompt, saved);

  const typing = startTyping(message.channel);
  const sessionId = config.persistSessions ? sessions.get(message.channelId) || null : null;

  const opts = {
    model: channelModel.get(message.channelId) ?? config.model,
    effort: channelEffort.get(message.channelId) ?? config.effort,
  };

  let result;
  try {
    result = await runClaude(fullPrompt, sessionId, opts);
  } finally {
    typing.stop();
  }

  if (config.persistSessions && result.sessionId) {
    sessions.set(message.channelId, result.sessionId);
  }

  const returned = await collectReturnFiles();
  await sendReply(message, result.text || '(no output)', returned, result.isError);

  // Clean up the transient dirs.
  await freshDir(FILES_DIR);
  await freshDir(RETURN_DIR);
}

/**
 * Handle a `c!` command. Returns true if the message was a command (and is now
 * fully dealt with), false if it should fall through to Claude as a prompt.
 */
async function handleCommand(message, raw) {
  const [cmd, ...rest] = raw.slice(2).split(/\s+/);
  const arg = rest.join(' ').trim();
  const cid = message.channelId;

  switch (cmd.toLowerCase()) {
    case 'reset':
    case 'new':
      sessions.delete(cid);
      await message.reply('🧹 Started a fresh conversation for this channel.');
      return true;

    case 'model': {
      if (!arg) {
        channelModel.delete(cid);
        await message.reply('↩️ Model reset to default.');
      } else {
        channelModel.set(cid, arg);
        await message.reply(`🤖 Model for this channel set to \`${arg}\`.`);
      }
      return true;
    }

    case 'effort': {
      if (!arg) {
        channelEffort.delete(cid);
        await message.reply('↩️ Effort reset to default.');
        return true;
      }
      const level = arg.toLowerCase();
      if (!EFFORT_LEVELS.includes(level)) {
        await message.reply(`❌ Unknown effort. Pick one of: ${EFFORT_LEVELS.join(', ')}.`);
        return true;
      }
      channelEffort.set(cid, level);
      const note = modelSupportsEffort(channelModel.get(cid) ?? config.model)
        ? ''
        : ' (note: current model may not support effort — it will be ignored)';
      await message.reply(`🎚️ Effort for this channel set to \`${level}\`.${note}`);
      return true;
    }

    case 'config':
    case 'status': {
      const model = (channelModel.get(cid) ?? config.model) || '(CLI default)';
      const effort = (channelEffort.get(cid) ?? config.effort) || '(default)';
      const ctx = config.persistSessions && sessions.has(cid) ? 'active' : 'fresh';
      await message.reply(
        `**Channel config**\n` +
          `- model: \`${model}\`\n` +
          `- effort: \`${effort}\`\n` +
          `- conversation: ${ctx}\n` +
          `- permission mode: \`${config.permissionMode}\``,
      );
      return true;
    }

    case 'help':
      await message.reply(
        `**Commands**\n` +
          `- \`c!model <alias|id>\` — set model (e.g. \`opus\`, \`sonnet\`, \`claude-opus-4-8\`). No arg = reset.\n` +
          `- \`c!effort <${EFFORT_LEVELS.join('|')}>\` — set reasoning effort (Sonnet/Opus). No arg = reset.\n` +
          `- \`c!config\` — show current settings.\n` +
          `- \`c!reset\` — start a fresh conversation.\n` +
          `Otherwise just talk to me, and attach files if you like.`,
      );
      return true;

    default:
      return false; // not a recognised command -> treat as a normal prompt
  }
}

function buildPrompt(prompt, savedFiles) {
  let header = '';
  if (savedFiles.length > 0) {
    header =
      `The user attached ${savedFiles.length} file(s), available in the ./files directory:\n` +
      savedFiles.map((f) => `  - files/${f}`).join('\n') +
      `\n\nIf you need to send any file(s) back to the user, write them into the ` +
      `../instance-return directory and they will be delivered as Discord attachments.\n\n`;
  } else {
    header =
      `If you need to send any file(s) back to the user, write them into the ` +
      `../instance-return directory and they will be delivered as Discord attachments.\n\n`;
  }
  return header + (prompt || 'Take a look at the attached file(s).');
}

async function sendReply(message, text, files, isError) {
  const attachments = files.map((f) => new AttachmentBuilder(f.path, { name: f.name }));
  const chunks = splitMessage(text);

  // If the text is huge, send it as a .md file instead of many messages.
  if (chunks.length > 5) {
    attachments.unshift(
      new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'response.md' }),
    );
    const prefix = isError ? '⚠️ ' : '';
    await message.reply({ content: `${prefix}Response was long — see attached.`, files: attachments });
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const payload = { content: chunks[i] };
    if (isLast && attachments.length > 0) payload.files = attachments;
    if (i === 0) await message.reply(payload);
    else await message.channel.send(payload);
  }

  // Edge case: empty text but files exist.
  if (chunks.length === 0 && attachments.length > 0) {
    await message.reply({ files: attachments });
  }
}

async function collectReturnFiles() {
  let entries = [];
  try {
    entries = await fs.readdir(RETURN_DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const full = path.join(RETURN_DIR, e.name);
    const stat = await fs.stat(full);
    if (stat.size > DISCORD_FILE_LIMIT) {
      console.warn(`Skipping ${e.name}: ${stat.size} bytes exceeds Discord upload limit.`);
      continue;
    }
    files.push({ path: full, name: e.name });
  }
  return files;
}

// ---------- helpers ----------

function stripMention(content) {
  if (!client.user) return content;
  return content
    .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
    .trim();
}

function sanitizeName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Split text on the 2000-char Discord limit, preferring line/word boundaries and keeping code fences sane. */
function splitMessage(text) {
  if (!text) return [];
  const out = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LEN) {
    let slice = remaining.slice(0, MAX_MESSAGE_LEN);
    let cut = slice.lastIndexOf('\n');
    if (cut < MAX_MESSAGE_LEN * 0.5) cut = slice.lastIndexOf(' ');
    if (cut < MAX_MESSAGE_LEN * 0.5) cut = MAX_MESSAGE_LEN;
    out.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, '');
  }
  if (remaining.length) out.push(remaining);
  return out;
}

function startTyping(channel) {
  let stopped = false;
  const tick = () => channel.sendTyping().catch(() => {});
  tick();
  const id = setInterval(() => !stopped && tick(), 8000);
  return {
    stop() {
      stopped = true;
      clearInterval(id);
    },
  };
}

async function freshDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download attachment (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

process.on('unhandledRejection', (err) => console.error('unhandledRejection', err));

function shutdown() {
  stopAutoText();
  client.destroy();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

client.login(config.token);


