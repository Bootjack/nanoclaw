# Git Hooks

This directory contains Git hooks that help maintain code quality by running checks before commits and pushes.

## Installation

To activate these hooks, run:

```bash
git config core.hooksPath .githooks
```

This tells Git to use the hooks in this directory instead of `.git/hooks/`.

> **Note:** This replaces the previous Husky-based hook setup. Husky has been removed to simplify the codebase and eliminate deprecation warnings.

## Available Hooks

### pre-commit

Runs before each commit to ensure code quality:
- **Linting** (`npm run lint`) - Catches formatting and style issues
- **Tests** (`npm test`) - Ensures all tests pass

If any check fails, the commit is blocked until the issues are fixed.

## Bypassing Hooks (Use Sparingly)

In rare cases where you need to commit despite failing checks:

```bash
git commit --no-verify
```

**Warning:** Only use `--no-verify` when absolutely necessary, as it defeats the purpose of these quality checks.

## Why Use Hooks?

1. **Catch issues early** - Find problems before pushing to remote
2. **Prevent broken builds** - Ensure tests pass before commits reach PRs
3. **Maintain consistency** - Enforce linting rules automatically
4. **Save CI time** - Reduce failed CI runs from preventable issues

## Updating Hooks

After pulling changes that update hooks, you may need to:

```bash
chmod +x .githooks/*
```

The hooks are already executable in the repository, but some Git configurations may need this.
