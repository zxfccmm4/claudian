#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RELEASE_ROOT = process.env.RELEASE_ROOT
  ? path.resolve(process.env.RELEASE_ROOT)
  : path.resolve(ROOT, "../../release/claudian-opencode-patched");

const sourceManifestPath = path.join(ROOT, "manifest.json");
const sourcePackagePath = path.join(ROOT, "package.json");
const overrideManifestPath = path.join(ROOT, "release-overrides", "manifest.override.json");
const readmeTemplatePath = path.join(ROOT, "release-overrides", "README.release.md");
const sourceMainPath = path.join(ROOT, "main.js");
const sourceStylesPath = path.join(ROOT, "styles.css");

if (!existsSync(sourceMainPath) || !existsSync(sourceStylesPath)) {
  console.error("Build artifacts not found. Run `npm run build` first.");
  process.exit(1);
}

const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, "utf8"));
const sourcePackage = JSON.parse(readFileSync(sourcePackagePath, "utf8"));
const manifestOverride = JSON.parse(readFileSync(overrideManifestPath, "utf8"));
const readmeTemplate = readFileSync(readmeTemplatePath, "utf8");

const versionSuffix = typeof manifestOverride.versionSuffix === "string" ? manifestOverride.versionSuffix : "";
const releaseVersion = `${sourceManifest.version}${versionSuffix}`;

const releaseManifest = {
  ...sourceManifest,
  ...Object.fromEntries(Object.entries(manifestOverride).filter(([key]) => key !== "versionSuffix")),
  version: releaseVersion
};

const replacements = {
  "{{PLUGIN_ID}}": releaseManifest.id,
  "{{UPSTREAM_NAME}}": sourceManifest.name,
  "{{UPSTREAM_VERSION}}": sourceManifest.version,
  "{{UPSTREAM_REPO}}": "github.com/YishenTu/claudian",
  "{{RELEASE_VERSION}}": releaseVersion
};

let releaseReadme = readmeTemplate;
for (const [token, value] of Object.entries(replacements)) {
  releaseReadme = releaseReadme.split(token).join(value);
}

mkdirSync(RELEASE_ROOT, { recursive: true });

copyFileSync(sourceMainPath, path.join(RELEASE_ROOT, "main.js"));
copyFileSync(sourceStylesPath, path.join(RELEASE_ROOT, "styles.css"));
writeFileSync(path.join(RELEASE_ROOT, "manifest.json"), JSON.stringify(releaseManifest, null, 2) + "\n");
writeFileSync(path.join(RELEASE_ROOT, "README.md"), releaseReadme);

console.log(`Exported release files to ${RELEASE_ROOT}`);
console.log(`Upstream package version: ${sourcePackage.version}`);
console.log(`Release version: ${releaseVersion}`);
