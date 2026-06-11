#!/usr/bin/env node
/**
 * CI / pre-commit gate: fail if any code writes a PLAINTEXT value to
 * `connector_credentials.encrypted_secret`.
 *
 * Every write must go through `encryptSecret()` from @kpi-platform/db. This is a
 * static backstop behind the runtime Prisma guard — it catches the leak at code
 * review / CI time instead of at runtime.
 *
 * A line is flagged when it assigns to `encryptedSecret:` (object-literal write)
 * or `.encryptedSecret =` and does NOT call `encryptSecret(...)`. Type
 * annotations, Prisma selects (`encryptedSecret: true`) and similar non-writes
 * are allow-listed.
 *
 * Usage: node scripts/check-secret-encryption.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOTS = ['apps', 'packages'];
const EXCLUDE_DIR = ['node_modules', 'dist', 'build', '.next', 'drizzle'];
const EXCLUDE_FILE = ['secret-cipher.ts'];

// RHS tokens that indicate a type annotation / select / non-write — allow-listed.
const SAFE_RHS = /^(true|any|unknown|string|number|boolean|null|Json|Record<|Array<|String)/;

const ASSIGN_RE = /encryptedSecret\s*:/;            // object-literal key: value
const PROP_ASSIGN_RE = /\.encryptedSecret\s*=/;     // obj.encryptedSecret = value

/** @type {{file:string,line:number,text:string}[]} */
const violations = [];

function scanFile(path) {
  if (!path.endsWith('.ts') || path.endsWith('.d.ts')) return;
  if (EXCLUDE_FILE.some((f) => path.endsWith(f))) return;

  const lines = readFileSync(path, 'utf8').split('\n');
  lines.forEach((text, i) => {
    const hasEncryptCall = text.includes('encryptSecret(');

    if (PROP_ASSIGN_RE.test(text) && !hasEncryptCall) {
      violations.push({ file: path, line: i + 1, text: text.trim() });
      return;
    }

    if (ASSIGN_RE.test(text)) {
      if (hasEncryptCall) return;
      const rhs = text.slice(text.search(ASSIGN_RE)).replace(/^encryptedSecret\s*:/, '').trim();
      if (SAFE_RHS.test(rhs)) return; // type / select / param annotation
      violations.push({ file: path, line: i + 1, text: text.trim() });
    }
  });
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIR.includes(entry.name)) continue;
      walk(join(dir, entry.name));
    } else if (entry.isFile()) {
      scanFile(join(dir, entry.name));
    }
  }
}

for (const root of ROOTS) walk(root);

if (violations.length > 0) {
  console.error('\n✖ Plaintext write(s) to connector_credentials.encrypted_secret detected.');
  console.error('  All writes MUST go through encryptSecret() from @kpi-platform/db.\n');
  for (const v of violations) {
    console.error(`  ${v.file.split(sep).join('/')}:${v.line}\n    ${v.text}`);
  }
  console.error('\nSee docs/security/connector-secret-rotation.md\n');
  process.exit(1);
}

console.log('✓ No plaintext encrypted_secret writes found.');