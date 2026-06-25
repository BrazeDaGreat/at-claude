import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Project root (one level up from src/)
export const ROOT = path.resolve(__dirname, '..');

// The directory Claude runs inside. Its .claude folder holds custom skills.
export const INSTANCE_DIR = path.join(ROOT, 'instance');

// Incoming Discord attachments are dropped here before Claude runs.
export const FILES_DIR = path.join(INSTANCE_DIR, 'files');

// Anything Claude wants to send back to Discord goes here.
export const RETURN_DIR = path.join(ROOT, 'instance-return');

export const config = {
  token: process.env.DISCORD_TOKEN,
  // Allowed Discord user IDs (comma-separated). Empty = anyone (not recommended).
  // OWNER_USER_ID is still honoured for backward compatibility.
  allowedUserIds: new Set(
    `${process.env.ALLOWED_USER_IDS || ''},${process.env.OWNER_USER_ID || ''}`
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  permissionMode: process.env.CLAUDE_PERMISSION_MODE || 'bypassPermissions',
  model: (process.env.CLAUDE_MODEL || '').trim(),
  effort: (process.env.CLAUDE_EFFORT || '').trim().toLowerCase(),
  timeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS || 600_000),
  persistSessions: (process.env.PERSIST_SESSIONS || 'true').toLowerCase() !== 'false',
};

if (!config.token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
