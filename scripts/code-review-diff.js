import { execSync } from 'child_process';
import path from 'path';

function getGitOutput(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function runCodeReviewDiff() {
  console.log('\n🔍 --- Pre-Commit Diff Summary ---\n');

  const status = getGitOutput('git status -s');
  if (!status) {
    console.log('✅ Working tree clean. No uncommitted changes detected.\n');
    return;
  }

  console.log('📁 Changed Files:');
  console.log(status);
  console.log('\n-----------------------------------\n');

  const stagedStat = getGitOutput('git diff --cached --stat');
  if (stagedStat) {
    console.log('📌 Staged Changes (--cached):');
    console.log(stagedStat);
    console.log('');
  }

  const unstagedStat = getGitOutput('git diff --stat');
  if (unstagedStat) {
    console.log('📝 Unstaged Changes:');
    console.log(unstagedStat);
    console.log('');
  }

  const untracked = getGitOutput('git ls-files --others --exclude-standard');
  if (untracked) {
    console.log('🆕 Untracked New Files:');
    console.log(untracked);
    console.log('');
  }

  console.log('💡 Tip: Ask AI "review my code" to perform an automated code review on these changes.\n');
}

runCodeReviewDiff();
