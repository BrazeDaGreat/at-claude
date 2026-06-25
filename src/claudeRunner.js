import { spawn } from 'node:child_process';
import { config, INSTANCE_DIR } from './config.js';

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * Effort only applies to Sonnet/Opus. If no model is set we assume the CLI
 * default (an Opus/Sonnet-class model) and allow it; for an explicit Haiku (or
 * anything else) we drop the flag so the CLI doesn't reject it.
 */
export function modelSupportsEffort(model) {
  if (!model) return true;
  return /sonnet|opus/i.test(model);
}

/**
 * Run `claude -p` inside the instance directory.
 *
 * The prompt is passed via stdin (not argv) so there is nothing to escape and
 * no shell injection surface. We use `--output-format json` so we can pull both
 * the result text and the session id back out.
 *
 * @param {string} prompt        The user's message text (already mention-stripped).
 * @param {string|null} resumeId  A previous session id to continue, or null for a fresh session.
 * @param {{ model?: string, effort?: string }} [opts]  Per-call model / effort overrides.
 * @returns {Promise<{ text: string, sessionId: string|null, isError: boolean }>}
 */
export function runClaude(prompt, resumeId = null, opts = {}) {
  const model = opts.model ?? config.model;
  const effort = opts.effort ?? config.effort;

  const args = ['-p', '--output-format', 'json', '--permission-mode', config.permissionMode];
  if (model) args.push('--model', model);
  if (effort && modelSupportsEffort(model)) args.push('--effort', effort);
  if (resumeId) args.push('--resume', resumeId);

  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeBin, args, {
      cwd: INSTANCE_DIR,
      windowsHide: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Claude timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to launch "${config.claudeBin}": ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      // Try to parse the JSON envelope regardless of exit code.
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        // not JSON — fall through
      }

      if (parsed) {
        resolve({
          text: typeof parsed.result === 'string' ? parsed.result : stdout,
          sessionId: parsed.session_id || null,
          isError: Boolean(parsed.is_error) || code !== 0,
        });
        return;
      }

      if (code === 0 && stdout.trim()) {
        resolve({ text: stdout.trim(), sessionId: null, isError: false });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `claude exited with code ${code}`));
    });

    // Feed the prompt in and close stdin.
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
