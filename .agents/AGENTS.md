# Workspace Guidelines & Rules

## Code Review Policy
- When performing pre-commit code reviews or inspecting uncommitted diffs:
  1. Inspect only the modified or added lines (`git diff`, `git diff --cached`, untracked files).
  2. Do not raise warnings on pre-existing untouched code unless current changes cause a direct regression or breaking change to it.
  3. Always link directly to line numbers using `[file.ext:L10](file:///path/to/file.ext#L10)`.
  4. Categorize feedback clearly into Critical 🚨, Warnings ⚠️, and Suggestions 💡.
