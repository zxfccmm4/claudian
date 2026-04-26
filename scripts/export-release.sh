#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_ROOT_DEFAULT="$ROOT_DIR/../../release/claudian-opencode-patched"
RELEASE_ROOT="${RELEASE_ROOT:-$RELEASE_ROOT_DEFAULT}"
RELEASE_DIR="$(cd "$(dirname "$RELEASE_ROOT")" && pwd)"
RELEASE_BASENAME="$(basename "$RELEASE_ROOT")"

cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "Dependencies are missing. Run \`npm install\` first."
  exit 1
fi

echo "Building source plugin..."
npm run build

echo "Exporting release files..."
node scripts/export-release.mjs

RELEASE_VERSION="$(node -e 'const manifest=require("./manifest.json"); const overrides=require("./release-overrides/manifest.override.json"); const suffix=typeof overrides.versionSuffix==="string"?overrides.versionSuffix:""; process.stdout.write(`${manifest.version}${suffix}`);')"
ZIP_NAME="${RELEASE_BASENAME}-${RELEASE_VERSION}.zip"

echo "Packaging release zip..."
cd "$RELEASE_DIR"
rm -f "$ZIP_NAME"
zip -r "$ZIP_NAME" "$RELEASE_BASENAME" -x "$RELEASE_BASENAME/.git/*" "$RELEASE_BASENAME/.git"

echo "Computing SHA256..."
shasum -a 256 "$ZIP_NAME"

echo
echo "Release root: $RELEASE_ROOT"
echo "Zip: $RELEASE_DIR/$ZIP_NAME"
