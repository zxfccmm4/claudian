#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"

echo "Fetching remotes..."
git fetch origin
git fetch upstream

if git show-ref --verify --quiet refs/heads/upstream-main; then
  git checkout upstream-main
else
  git checkout -b upstream-main upstream/main
fi

echo "Resetting upstream-main to upstream/main..."
git reset --hard upstream/main

echo "Pushing refreshed upstream-main to origin..."
git push origin upstream-main --force-with-lease

echo "Rebasing main onto upstream-main..."
git checkout main
git rebase upstream-main

echo
echo "Sync complete."
echo "Current branch: $(git branch --show-current)"
echo "Previous branch was: $CURRENT_BRANCH"
echo
echo "Next recommended steps:"
echo "  npm install"
echo "  npm run build"
echo "  git status"
echo "  git push origin main"
