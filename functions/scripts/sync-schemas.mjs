#!/usr/bin/env node
/**
 * Sync the inlined Zod schemas from the client copy at `src/schemas/`
 * into `functions/src/ai/schemas/`, then rewrite every `from './x'`
 * (or `from "../x/y"`) relative import to append the NodeNext-required
 * `.js` extension.
 *
 * Run after editing the client copy:
 *
 *     cd functions && node scripts/sync-schemas.mjs
 *
 * or:
 *
 *     cd functions && npm run sync-schemas
 *
 * The script is portable (no BSD/GNU sed difference), handles both
 * `./x` and `../x/y` relative imports, and tolerates either single or
 * double quote styles.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = join(__dirname, '..');
const ROOT_DIR = join(FUNCTIONS_DIR, '..');
const CLIENT_DIR = join(ROOT_DIR, 'src', 'schemas');
const TARGET_DIR = join(FUNCTIONS_DIR, 'src', 'ai', 'schemas');

/** Match `from '<path>';` or `from "<path>";` where path is a relative import. */
const REL_IMPORT = /from\s+(['"])(\.{1,2}\/[^'"]+?)\1/g;

function copyRecursive(src, dst) {
  if (!existsSync(src)) {
    console.error(`Source directory does not exist: ${src}`);
    process.exit(1);
  }
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true });
  }
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const sp = join(src, entry);
    const dp = join(dst, entry);
    if (statSync(sp).isDirectory()) {
      copyRecursive(sp, dp);
    } else {
      writeFileSync(dp, readFileSync(sp));
    }
  }
}

function rewriteImports(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      rewriteImports(p);
      continue;
    }
    if (!p.endsWith('.ts')) continue;
    const original = readFileSync(p, 'utf8');
    const rewritten = original.replace(REL_IMPORT, (_m, q, rel) =>
      `from ${q}${rel}.js${q}`,
    );
    if (rewritten !== original) {
      writeFileSync(p, rewritten);
    }
  }
}

console.log(`Copying ${CLIENT_DIR} -> ${TARGET_DIR}`);
copyRecursive(CLIENT_DIR, TARGET_DIR);

console.log(`Applying .js extensions to relative imports under ${TARGET_DIR}`);
rewriteImports(TARGET_DIR);

console.log('Schemas synced.');
