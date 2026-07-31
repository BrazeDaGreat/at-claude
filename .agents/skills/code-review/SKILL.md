---
name: code-review
description: Perform an AI pre-commit code review on uncommitted git changes (staged, unstaged, or untracked files). Focuses strictly on new/modified code changes without re-reviewing untouched legacy code.
---

# Pre-Commit AI Code Review Skill

Use this skill whenever the user asks to review uncommitted code changes, perform a code review, check pre-commit quality, or invokes `/code-review`.

## Objective
Provide an immediate, focused, high-precision code review targeting **only uncommitted changes** (`git diff --cached`, `git diff`, and new untracked files). Identify bugs, security vulnerabilities, edge cases, breaking changes, and performance issues before code is committed to version control.

---

## Workflow Steps

### 1. Gather Uncommitted Changes
Execute the following git commands to discover all modified, staged, and newly created files:

1. Check working tree status:
   ```bash
   git status -s
   ```
2. Retrieve staged changes:
   ```bash
   git diff --cached
   ```
3. Retrieve unstaged changes:
   ```bash
   git diff
   ```
4. If new untracked files exist, inspect their content using `view_file`.

> **Note**: If there are no uncommitted changes found, notify the user that the working tree is clean and ask if they would like to review recent commits instead (e.g. `git diff HEAD~1`).

---

## 2. Review Guidelines & Focus Areas

Strictly limit analysis to **added (+), modified, or removed (-)** lines and their immediate surrounding context. Do **NOT** flag issues in untouched legacy code unless a change directly breaks compatibility with existing logic.

Evaluate the changes across these 5 key dimensions:

### A. Correctness & Edge Cases
- **Null / Undefined checks**: Unchecked property access on objects, unhandled null/undefined values.
- **Async Handling**: Missing `await` on promises, unhandled promise rejections, missing `try/catch` in async handlers.
- **Off-by-one & Boundary logic**: Incorrect array indexing, improper loop boundaries, empty array/object edge cases.
- **Resource Leaks**: Open event listeners, unclosed streams/connections, timer cleanup.

### B. Security & Credentials
- **Hardcoded Secrets**: Embedded API keys, tokens, passwords, private keys, or environment secrets.
- **Injection Risks**: Unsanitized user inputs passed to command executions, database queries, or evaluation functions.
- **Insecure Dependencies**: Newly added vulnerable packages or loose version ranges.

### C. API & Signature Integrity
- **Breaking Signature Changes**: Modified parameters or return types of functions called elsewhere in the codebase.
- **Export Mismatches**: Unexported types, functions, or modules consumed by other files.
- **Missing Updating Call Sites**: When function parameters change, ensure all calling locations are updated.

### D. Performance & Resource Efficiency
- **Redundant Operations**: Unnecessary database/network calls inside loops or high-frequency callbacks.
- **Memory Overhead**: Excessive cloning, duplicate object allocations, or unindexed searches.

### E. Code Quality & Maintainability
- **Error Logging**: Inadequate or silent swallow of error objects.
- **Readability & Clean Code**: Obscure variable names, unused imports/variables left behind.
- **Lint/Type Compliance**: Syntax issues, type coercion errors.

---

## 3. Output Format

Present the code review report structured as follows:

```markdown
# 🔍 Code Review Report

**Reviewed Files**: `<count> file(s) modified`
- `[filename.ext](file:///path/to/filename.ext)` (+X / -Y lines)

---

## Overall Verdict
- **[APPROVED | NEEDS_REVISION | BLOCKING_ISSUES]**
- *Brief summary statement on general code readiness.*

---

## 🚨 Critical / Blocking Issues
*(Issues that will cause runtime crashes, security flaws, or breaking bugs. Omit section if none found.)*

- **[Issue Title]** in `[filename.ext:L15](file:///path/to/filename.ext#L15)`
  - **Problem**: Explanation of the critical flaw.
  - **Fix**: Proposed code snippet fix.

---

## ⚠️ Warnings & Edge Cases
*(Logical flaws, unhandled edge cases, or potential risks. Omit section if none found.)*

- **[Issue Title]** in `[filename.ext:L42](file:///path/to/filename.ext#L42)`
  - **Problem**: Explanation of the risk or edge case.
  - **Fix**: Recommended improvement.

---

## 💡 Code Quality & Suggestions
*(Clean code, readability, performance, or minor refactoring suggestions. Omit section if none found.)*

- **[Suggestion Title]** in `[filename.ext:L88](file:///path/to/filename.ext#L88)`
  - **Details**: Brief suggestion.

---

## ✅ Positive Highlights
*(Notable good practices implemented in this diff, e.g. solid error handling, clean abstraction, good tests).*
```

---

## Example Trigger Phrases
- "Review my code changes"
- "Do a pre-commit code review"
- "Check my diff for issues"
- "/code-review"
