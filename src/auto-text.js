import { AttachmentBuilder } from "discord.js";

import { runClaude } from "./claudeRunner.js";

// ---------------- configuration ----------------

// Discord channel that receives Claude's automated responses.
const DISCORD_CHANNEL_ID = "1222593427288363040";

// Model used for these automated messages. Leave empty to use the Claude CLI default.
const CLAUDE_MODEL = "claude-haiku-4-5";

// Optional reasoning effort for Sonnet/Opus models: low, medium, high, xhigh, max.
const CLAUDE_EFFORT = "";

// Whether to keep one continuous Claude conversation across automated messages.
const PERSIST_SESSION = false;

// Whether each automation should run once immediately when the bot starts.
const RUN_ON_START = true;

// Messages to send to Claude. Times use the bot machine's local timezone.
// Use 24-hour HH:mm format, e.g. "05:00" or "10:05".
const AUTOMATED_MESSAGES = [
  {
    name: "default-check-in",
    times: ["05:00", "10:05"],
    prompt: "Ping, are you up and running?",
  },
];

// Discord's normal message cap is 2000 chars. Long Claude outputs become a file.
const MAX_MESSAGE_LEN = 2000;
const MAX_INLINE_CHUNKS = 5;

// ------------------------------------------------

let sessionId = null;
let started = false;
let stopped = false;
const timeoutIds = [];

/**
 * Start automated Claude messages inside the already-running Discord bot.
 *
 * Schedules are intentionally in-memory only: they exist only while this Node
 * process is running, and disappear naturally when the bot stops/restarts.
 *
 * @param {import('discord.js').Client} client
 * @param {{ runExclusive?: <T>(fn: () => Promise<T>) => Promise<T> }} [opts]
 */
export async function startAutoText(client, opts = {}) {
  if (started) {
    console.log(
      "Auto-text scheduler is already running; skipping duplicate start.",
    );
    return;
  }

  started = true;
  stopped = false;

  const runExclusive = opts.runExclusive ?? ((fn) => fn());

  const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    started = false;
    throw new Error(
      `Discord channel ${DISCORD_CHANNEL_ID} was not found or is not text-based.`,
    );
  }

  for (const item of AUTOMATED_MESSAGES) {
    scheduleAutomatedMessage(channel, item, runExclusive);
  }

  console.log(
    `Auto-text scheduler started for Discord channel ${DISCORD_CHANNEL_ID}.`,
  );
}

export function stopAutoText() {
  stopped = true;
  for (const id of timeoutIds.splice(0)) {
    clearTimeout(id);
  }
  started = false;
  console.log("Auto-text scheduler stopped.");
}

function scheduleAutomatedMessage(channel, item, runExclusive) {
  validateAutomatedMessage(item);

  const run = () => {
    if (stopped) return;
    runExclusive(() => sendAutomatedMessage(channel, item)).catch((err) => {
      console.error(`[${item.name}] failed:`, err);
    });
  };

  if (RUN_ON_START) run();

  for (const time of item.times) {
    scheduleNextRun(time, run, item.name);
  }

  console.log(
    `[${item.name}] scheduled at ${item.times.join(", ")} local time.`,
  );
}

function scheduleNextRun(time, run, name) {
  const delayMs = msUntilNextTime(time);
  const timeoutId = setTimeout(() => {
    removeTimeoutId(timeoutId);
    run();
    if (!stopped) scheduleNextRun(time, run, name);
  }, delayMs);

  timeoutIds.push(timeoutId);
  console.log(`[${name}] next ${time} run in ${Math.round(delayMs / 1000)}s.`);
}

function removeTimeoutId(timeoutId) {
  const index = timeoutIds.indexOf(timeoutId);
  if (index !== -1) timeoutIds.splice(index, 1);
}

function msUntilNextTime(time) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new Error(
      `Invalid time "${time}". Use 24-hour HH:mm format, e.g. "05:00".`,
    );
  }

  const [, hour, minute] = match;
  const now = new Date();
  const next = new Date(now);
  next.setHours(Number(hour), Number(minute), 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function sendAutomatedMessage(channel, item) {
  console.log(`[${item.name}] sending prompt to Claude...`);

  const result = await runClaude(
    item.prompt,
    PERSIST_SESSION ? sessionId : null,
    {
      model: CLAUDE_MODEL,
      effort: CLAUDE_EFFORT,
    },
  );

  if (PERSIST_SESSION && result.sessionId) {
    sessionId = result.sessionId;
  }

  const prefix = result.isError
    ? `⚠️ **${item.name}**\n`
    : `**${item.name}**\n`;
  await sendDiscordOutput(channel, prefix + (result.text || "(no output)"));
  console.log(`[${item.name}] sent output to Discord.`);
}

async function sendDiscordOutput(channel, text) {
  const chunks = splitMessage(text);

  if (chunks.length > MAX_INLINE_CHUNKS) {
    await channel.send({
      content: "Claude response was long — see attached.",
      files: [
        new AttachmentBuilder(Buffer.from(text, "utf8"), {
          name: `claude-auto-${Date.now()}.md`,
        }),
      ],
    });
    return;
  }

  for (const chunk of chunks) {
    await channel.send(chunk);
  }
}

function validateAutomatedMessage(item) {
  if (!item || typeof item !== "object") {
    throw new Error("Each automated message must be an object.");
  }
  if (!item.name || typeof item.name !== "string") {
    throw new Error("Each automated message needs a string name.");
  }
  if (!Array.isArray(item.times) || item.times.length === 0) {
    throw new Error(
      `[${item.name}] times must be a non-empty array of HH:mm strings.`,
    );
  }
  for (const time of item.times) {
    msUntilNextTime(time);
  }
  if (!item.prompt || typeof item.prompt !== "string") {
    throw new Error(`[${item.name}] prompt must be a non-empty string.`);
  }
}

/** Split text on the 2000-char Discord limit, preferring line/word boundaries. */
function splitMessage(text) {
  if (!text) return [];

  const out = [];
  let remaining = text;

  while (remaining.length > MAX_MESSAGE_LEN) {
    const slice = remaining.slice(0, MAX_MESSAGE_LEN);
    let cut = slice.lastIndexOf("\n");
    if (cut < MAX_MESSAGE_LEN * 0.5) cut = slice.lastIndexOf(" ");
    if (cut < MAX_MESSAGE_LEN * 0.5) cut = MAX_MESSAGE_LEN;

    out.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\n/, "");
  }

  if (remaining.length) out.push(remaining);
  return out;
}
