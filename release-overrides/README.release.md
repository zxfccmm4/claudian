# Claudian-Studio

Patched distribution of the `{{PLUGIN_ID}}` Obsidian plugin.

This package is based on upstream `{{UPSTREAM_NAME}} {{UPSTREAM_VERSION}}` and includes local fixes focused on Claude, Codex, and OpenCode integration.

Modified from the upstream project:
[{{UPSTREAM_REPO}}](https://{{UPSTREAM_REPO}})

## Included fixes

- OpenCode no longer forces `--pure`, so OMO plugins, skills, and slash commands can load.
- OpenCode now inherits local CLI environment better, including XDG paths and cached OMO runtime assets.
- OpenCode settings include:
  - current environment model sync
  - provider filtering for model lists
  - counts per provider
  - commands and skills overview
  - hidden skills / commands
  - MCP server overview
- Codex settings now include:
  - current environment model sync from `~/.codex/config.toml`
  - commands and skills overview
  - MCP server overview from Codex config
- Claude settings now include:
  - current environment model sync from `~/.claude/settings.json`
  - commands and skills overview
- Provider/model dropdown UI was improved:
  - horizontal provider tabs
  - click-to-open behavior instead of hover-only
  - cleaner OpenCode icon handling
  - improved provider tab styling
- Input text readability was improved.

## Package contents

- `manifest.json`
- `main.js`
- `styles.css`

## Install

Copy these files into your vault plugin directory:

```text
.obsidian/plugins/{{PLUGIN_ID}}/
```

Then restart Obsidian or disable and re-enable the plugin.

## Notes

- This is a patched local distribution, not an official upstream release.
- The plugin id remains `{{PLUGIN_ID}}` so it installs over the existing plugin data path.
- The manifest version is marked as `{{RELEASE_VERSION}}` to distinguish it from the upstream package.

## Upstream updates

The source-maintenance fork is separate from the release repository.

- Source fork: `https://github.com/zxfccmm4/claudian`
- Release repo: `https://github.com/zxfccmm4/Claudian-Studio`

For upstream sync, use:

```bash
./scripts/sync-upstream.sh
```

For release export, use:

```bash
./scripts/export-release.sh
```
