# MAINTENANCE

This repo layout has three separate responsibilities:

1. Upstream source
   `https://github.com/YishenTu/claudian`

2. Source maintenance fork
   `https://github.com/zxfccmm4/claudian`

3. Public release repo
   `https://github.com/zxfccmm4/Claudian-Studio`

The branch you should treat as the real working branch is:

`steve-opencode-patches`

It is based on upstream `feature/opencode-support`, not upstream `main`.

## Local directories

Source maintenance main:

```text
/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian
```

OpenCode patch branch worktree:

```text
/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian-opencode-patches
```

Release repo:

```text
/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/release/claudian-opencode-patched
```

Active Obsidian install:

```text
/Users/stevezhou/Library/Mobile Documents/iCloud~md~obsidian/Documents/Steve Vault/.obsidian/plugins/claudian-opencode
```

## Normal daily workflow

Do new work in:

```bash
cd "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian-opencode-patches"
```

Then:

```bash
npm run typecheck
npm test
```

If the change is ready:

```bash
git add <files>
git commit -m "Your message"
git push origin steve-opencode-patches
```

Do not make ongoing feature changes directly in:

- `release/claudian-opencode-patched`
- `Steve Vault/.obsidian/plugins/claudian-opencode/main.js`

Those are output locations, not the source of truth.

## When upstream changes

First update the source-maintenance main repo:

```bash
cd "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian"
./scripts/sync-upstream.sh
```

That keeps your fork's `main` and `upstream-main` current with upstream `main`.

Then check whether upstream `feature/opencode-support` moved.

In the patch branch worktree:

```bash
cd "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian-opencode-patches"
git fetch upstream
```

If upstream OpenCode work is still happening on `feature/opencode-support`, rebase onto it:

```bash
git rebase upstream/feature/opencode-support
```

If upstream eventually merges OpenCode support into `main`, switch the base:

```bash
git rebase upstream/main
```

After any rebase:

```bash
npm run typecheck
npm test
git push origin steve-opencode-patches
```

## How to decide whether a maintenance update is needed

Check these three branch heads:

- upstream `main`
- upstream `feature/opencode-support`
- your `steve-opencode-patches`

If upstream did not move, you usually do not need a rebase.

If only your branch moved, you only need a new release export and possibly a new GitHub release.

## Release workflow

Build and export from the patch branch:

```bash
cd "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/source/claudian-opencode-patches"
npm run export:release
```

This updates:

```text
/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/release/claudian-opencode-patched
```

and creates a zip like:

```text
claudian-opencode-patched-<version>.zip
```

## Sync the local Obsidian install

After exporting, copy the release files into the active vault plugin directory:

```bash
cp release/claudian-opencode-patched/main.js "/Users/stevezhou/Library/Mobile Documents/iCloud~md~obsidian/Documents/Steve Vault/.obsidian/plugins/claudian-opencode/main.js"
cp release/claudian-opencode-patched/styles.css "/Users/stevezhou/Library/Mobile Documents/iCloud~md~obsidian/Documents/Steve Vault/.obsidian/plugins/claudian-opencode/styles.css"
cp release/claudian-opencode-patched/manifest.json "/Users/stevezhou/Library/Mobile Documents/iCloud~md~obsidian/Documents/Steve Vault/.obsidian/plugins/claudian-opencode/manifest.json"
```

Then fully restart Obsidian.

## Publish the release repo

The release repo is a separate git repo. After export:

```bash
cd "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/release/claudian-opencode-patched"
git add README.md main.js manifest.json styles.css
git commit -m "Update release package to <version>"
git push origin main
```

Then publish a GitHub release:

```bash
gh release create v<version> \
  "/Users/stevezhou/Library/Mobile Documents/com~apple~CloudDocs/Developer/OpenCode-Obsidian/release/claudian-opencode-patched-<version>.zip" \
  --repo zxfccmm4/Claudian-Studio \
  --title "v<version>" \
  --notes-file README.md
```

## Minimum validation before release

Always run:

```bash
npm run typecheck
```

For OpenCode-heavy changes, also run:

```bash
npm test -- tests/unit/providers/opencode/configuredMcp.test.ts \
  tests/unit/providers/opencode/OpencodeChatRuntime.test.ts \
  tests/unit/providers/opencode/OpencodeSettingsTab.test.ts \
  tests/unit/providers/opencode/capabilities.test.ts \
  tests/unit/features/chat/ui/InputToolbar.test.ts
```

## Important repo-specific notes

- `steve-opencode-patches` should track `origin/steve-opencode-patches`
- This branch is expected to be ahead of upstream `feature/opencode-support`
- `package-lock.json` is often dirty locally; do not include it unless it is intentionally part of the change
- The plugin id stays `claudian-opencode` even though the public package name is `Claudian-Studio`
- The release repo and the source repo are intentionally separate

## Good mental model

Think of the flow as:

```text
upstream -> source fork main -> steve-opencode-patches -> release export -> Claudian-Studio release repo -> GitHub Release -> local Obsidian install
```

If something feels confusing, find which layer you are in first.
