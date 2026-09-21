#!/usr/bin/env node
// Prepares the tracked files for a repository rename: replaces the old repository name (default `advanced-shooting-analysis`) with the
// new one in text files, so package.json, the docs, the licence notice and the .claude helpers point at the new URL.
//
//   node scripts/rename-repo.mjs <new-name> [--old <old-name>] [--dry-run] [--include-dirty]
//
// Files with uncommitted changes are skipped (listed) unless --include-dirty, so someone else's work in progress is not mixed in.
// The Pages build takes its base path from the repository name (`.github/workflows/pages.yml`), so nothing there needs editing.
// After the GitHub rename also run: git remote set-url origin https://github.com/<owner>/<new-name>.git

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const newName = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--old');
const oldName = valueOf('--old') ?? 'advanced-shooting-analysis';

if (newName === undefined || !/^[A-Za-z0-9._-]+$/.test(newName)) {
  console.error('usage: node scripts/rename-repo.mjs <new-name> [--old <old-name>] [--dry-run] [--include-dirty]');
  process.exit(2);
}

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.heic', '.gif', '.ico', '.webp', '.wasm', '.pdf', '.woff', '.woff2']);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });

const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const dirty = new Set(
  git('status', '--porcelain', '-z')
    .split('\0')
    .filter(Boolean)
    .map((line) => line.slice(3)),
);

const changed = [];
const skipped = [];
for (const file of tracked) {
  if (BINARY.has(extname(file).toLowerCase()) || file === 'pnpm-lock.yaml' || file.startsWith('fixtures/')) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!text.includes(oldName)) continue;
  if (dirty.has(file) && !flag('--include-dirty')) {
    skipped.push(file);
    continue;
  }
  const count = text.split(oldName).length - 1;
  changed.push(`${file} (${count})`);
  if (!flag('--dry-run')) writeFileSync(file, text.split(oldName).join(newName));
}

console.log(`${flag('--dry-run') ? 'Would change' : 'Changed'} ${changed.length} files:`);
for (const c of changed) console.log(`  ${c}`);
if (skipped.length > 0) {
  console.log(`Skipped ${skipped.length} with uncommitted changes (commit or stash them, or use --include-dirty):`);
  for (const s of skipped) console.log(`  ${s}`);
}
console.log('Next: git remote set-url origin https://github.com/<owner>/' + newName + '.git, run pnpm check, commit and push.');
