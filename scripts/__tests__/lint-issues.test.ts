/**
 * End-to-end tests for `lint-issues` script.
 *
 * Only validates argument parsing and failure modes — full live-API tests
 * require LINEAR_API_KEY and are out of scope for unit tests.
 *
 * Run: npm test (requires: npm run build)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const CLI = join(ROOT, 'dist', 'lint-issues.js');

// Scrub LINEAR_API_KEY. Without this, tests would inherit the developer's
// real key and the MISSING_API_KEY assertion would silently pass for the
// wrong reason (see smoke.test.ts:58-60 for the same pattern).
const SCRUBBED_ENV = { ...process.env, LINEAR_API_KEY: '' };

function run(args: string[]): SpawnSyncReturns<string> {
  return spawnSync('node', [CLI, ...args], {
    cwd: ROOT,
    env: SCRUBBED_ENV,
    encoding: 'utf8',
  }) as SpawnSyncReturns<string>;
}

describe('lint-issues CLI', () => {
  before(() => {
    if (!existsSync(CLI)) {
      throw new Error('dist/lint-issues.js not built — run `npm run build` first');
    }
  });

  it('exits 2 with no flags', () => {
    const r = run([]);
    assert.strictEqual(r.status, 2, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /required|Usage/i);
  });

  it('exits 2 on malformed --since value', () => {
    const r = run(['--since', 'foo']);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /Invalid --since/i);
  });

  it('exits 2 on unknown flag', () => {
    const r = run(['--not-a-real-flag']);
    assert.strictEqual(r.status, 2);
  });

  it('exits 2 on non-numeric --limit', () => {
    const r = run(['--since', '7d', '--limit', 'abc']);
    assert.strictEqual(r.status, 2);
  });

  it('exits 1 (MISSING_API_KEY) when flags are valid but no API key', () => {
    const r = run(['--since', '24h']);
    assert.strictEqual(r.status, 1, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /LINEAR_API_KEY/i);
  });

  it('accepts --help without API key', () => {
    const r = run(['--help']);
    // Help path intentionally exits via usage() which returns INVALID_ARGUMENTS.
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /lint-issues/i);
  });
});
