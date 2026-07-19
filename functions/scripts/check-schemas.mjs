#!/usr/bin/env node
/**
 * Verify that the inlined schemas under `functions/src/ai/schemas/`
 * stay in sync with the client copy at `src/schemas/`. The NodeNext
 * `.js` extension is a veneer and is normalized out of the comparison,
 * so this catches real content drift without firing on the import-path
 * difference.
 *
 * Exit 0 when schemas are in sync, exit 1 with a report when they
 * aren't. Run before deploy (`prebuild` invokes this), or manually:
 *
 *     cd functions && npm run check-schemas
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = join(__dirname, '..');
const ROOT_DIR = join(FUNCTIONS_DIR, '..');
const CLIENT_DIR = join(ROOT_DIR, 'src', 'schemas');
const TARGET_DIR = join(FUNCTIONS_DIR, 'src', 'ai', 'schemas');

/** Match a `from '<rel>';` (single- or double-quoted) relative import. */
const REL_IMPORT = /from\s+(['"])(\.{1,2}\/[^'"]+?)\1/g;

function walk(dir) {
  /** Yield every .ts file under `dir`, recursively. */
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...walk(p));
      continue;
    }
    if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function collectFiles(dir) {
  const out = new Map();
  for (const p of walk(dir)) {
    out.set(relative(dir, p), readFileSync(p, 'utf8'));
  }
  return out;
}

/** Strip a trailing `.js` from relative imports so both sides compare equal. */
function normalize(content) {
  return content.replace(
    REL_IMPORT,
    (_m, q, rel) => `from ${q}${rel.replace(/\.js$/, '')}${q}`,
  );
}

const client = collectFiles(CLIENT_DIR);
const fnCopy = collectFiles(TARGET_DIR);

let drift = false;

for (const [file, content] of client) {
  if (!fnCopy.has(file)) {
    console.error(`Missing in functions copy: ${file}`);
    drift = true;
    continue;
  }
  const a = normalize(content);
  const b = normalize(fnCopy.get(file));
  if (a !== b) {
    console.error(`Content drift: ${file}`);
    drift = true;
  }
}

for (const file of fnCopy.keys()) {
  if (!client.has(file)) {
    console.error(`Extra in functions copy (no client counterpart): ${file}`);
    drift = true;
  }
}

if (drift) {
  console.error('');
  console.error('Schema drift detected.');
  console.error('Run from functions/: npm run sync-schemas');
  process.exit(1);
}
console.log('Schemas in sync.');
