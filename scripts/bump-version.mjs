#!/usr/bin/env node
/**
 * Version bump script for FlowVid Desktop.
 *
 * Usage:
 *   node scripts/bump-version.mjs 1.0.1
 *   node scripts/bump-version.mjs patch    (1.0.0 -> 1.0.1)
 *   node scripts/bump-version.mjs minor    (1.0.0 -> 1.1.0)
 *   node scripts/bump-version.mjs major    (1.0.0 -> 2.0.0)
 *
 * This updates:
 *   - package.json
 *   - src-tauri/tauri.conf.json
 *   - src-tauri/Cargo.toml
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/bump-version.mjs <version|patch|minor|major>");
  process.exit(1);
}

// Read current version from package.json
const pkgPath = resolve(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const current = pkg.version;
const [major, minor, patch] = current.split(".").map(Number);

let newVersion;
if (arg === "patch") newVersion = `${major}.${minor}.${patch + 1}`;
else if (arg === "minor") newVersion = `${major}.${minor + 1}.0`;
else if (arg === "major") newVersion = `${major + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) newVersion = arg;
else {
  console.error(`Invalid version: "${arg}". Use semver (1.0.1) or patch/minor/major.`);
  process.exit(1);
}

console.log(`Bumping version: ${current} → ${newVersion}\n`);

// 1. package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`  ✓ package.json`);

// 2. tauri.conf.json
const tauriPath = resolve(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(readFileSync(tauriPath, "utf-8"));
tauri.version = newVersion;
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");
console.log(`  ✓ src-tauri/tauri.conf.json`);

// 3. Cargo.toml
const cargoPath = resolve(root, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf-8");
cargo = cargo.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${newVersion}"`
);
writeFileSync(cargoPath, cargo);
console.log(`  ✓ src-tauri/Cargo.toml`);

console.log(`\nDone! Now commit and tag:\n`);
console.log(`  git add -A`);
console.log(`  git commit -m "release: v${newVersion}"`);
console.log(`  git tag v${newVersion}`);
console.log(`  git push origin main --tags`);
console.log(`\nGitHub Actions will build and publish the release automatically.`);
