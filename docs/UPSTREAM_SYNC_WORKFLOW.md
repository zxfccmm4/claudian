# Upstream Sync Workflow

This repository is the source-maintenance fork for `YishenTu/claudian`.

## Branch roles

- `main`
  Your working branch for local modifications and future source-level patches.
- `upstream-main`
  A clean mirror of `upstream/main`, updated whenever you sync.

## Remotes

- `origin`
  Your fork: `https://github.com/zxfccmm4/claudian.git`
- `upstream`
  Original source: `https://github.com/YishenTu/claudian.git`

## Normal update flow

Run:

```bash
./scripts/sync-upstream.sh
```

This does the following:

1. Verifies your working tree is clean
2. Fetches `origin` and `upstream`
3. Resets local `upstream-main` to `upstream/main`
4. Force-updates remote `origin/upstream-main`
5. Rebases your local `main` branch on top of `upstream-main`

## After sync

1. Resolve any rebase conflicts if they appear
2. Rebuild:

```bash
npm install
npm run build
```

3. Test your changes
4. Commit your patch updates on `main`
5. Push:

```bash
git push origin main
```

## Release flow

This source repo is for tracking and patching upstream source.

The public release repo is:

- `https://github.com/zxfccmm4/Claudian-Studio`

After rebuilding, copy the release artifacts (`manifest.json`, `main.js`, `styles.css`, and release docs) into the release repo, then publish a new GitHub release there.

## Notes

- Keep `upstream-main` free of local edits.
- Do not develop directly on `upstream-main`.
- If you want to experiment, create a temporary branch from `main`.
