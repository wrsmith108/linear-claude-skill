#!/usr/bin/env node
// Usage: node scripts/sync-skill-version.mjs <version>
//
// Rewrites the `version:` field in SKILL.md's YAML frontmatter to match the
// version semantic-release is about to publish. Runs as `prepareCmd` via
// @semantic-release/exec (see release.config.js), before @semantic-release/git
// stages the release commit.
//
// Kept as plain ESM .mjs so it has zero compile step at release time and is
// not part of the dist/ bundle.
//
// Exit 0 = success. Any non-zero exit aborts the semantic-release run, at
// which point recovery is manual: @semantic-release/npm has already bumped
// package.json and package-lock.json, so `git checkout package.json
// package-lock.json` undoes those changes. No git tag or GitHub release is
// created on failure.

import { readFileSync, writeFileSync } from 'node:fs';

const [, , version] = process.argv;

if (!version) {
  console.error('sync-skill-version: <version> argument required');
  console.error('Usage: node scripts/sync-skill-version.mjs <version>');
  process.exit(1);
}

const path = 'SKILL.md';

let src;
try {
  src = readFileSync(path, 'utf8');
} catch (err) {
  console.error(`sync-skill-version: cannot read ${path}: ${err.message}`);
  process.exit(1);
}

// Scope the rewrite to the YAML frontmatter block so we never accidentally
// touch a `version:` line that appears in prose or a code example below.
const fmMatch = src.match(/^---\n([\s\S]*?)\n---\n/);
if (!fmMatch) {
  console.error(`sync-skill-version: no YAML frontmatter found in ${path}`);
  console.error(`Expected file to start with '---\\n<yaml>\\n---\\n'`);
  process.exit(1);
}

const updatedFm = fmMatch[1].replace(/^(version:\s*).*$/m, `$1${version}`);
if (updatedFm === fmMatch[1]) {
  console.error(`sync-skill-version: no 'version:' line in ${path} frontmatter`);
  console.error(`Add 'version: X.Y.Z' to the YAML block between --- fences.`);
  process.exit(1);
}

const updated = src.replace(fmMatch[1], updatedFm);
writeFileSync(path, updated);
console.log(`sync-skill-version: ${path} → ${version}`);
