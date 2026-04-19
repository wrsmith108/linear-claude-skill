/**
 * End-to-end tests for `validate-description` subcommand.
 *
 * Spawns the compiled dist/linear-ops.js bundle and asserts exit codes
 * and stderr fragments for each code path.
 *
 * Run: npm test (requires: npm run build)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..', '..');
const CLI = join(ROOT, 'dist', 'linear-ops.js');

const VALID_BODY = [
  '## Context',
  'We need to enforce acceptance criteria on every new Linear issue because today the description field is optional and frequently empty.',
  '',
  '## Acceptance Criteria',
  '- [ ] Validator rejects descriptions shorter than the minimum body length',
  '- [ ] Validator accepts descriptions that include the full template',
].join('\n');

// Always scrub LINEAR_API_KEY: this command must not depend on it, and we
// don't want tests silently inheriting the developer's real key (see
// smoke.test.ts:58-60 for the same pattern).
const SCRUBBED_ENV = { ...process.env, LINEAR_API_KEY: '' };

function run(args: string[], opts: { input?: string } = {}): SpawnSyncReturns<string> {
  return spawnSync('node', [CLI, 'validate-description', ...args], {
    cwd: ROOT,
    env: SCRUBBED_ENV,
    input: opts.input,
    encoding: 'utf8',
  }) as SpawnSyncReturns<string>;
}

describe('validate-description CLI', () => {
  let tmpDir: string;
  let validFile: string;
  let invalidFile: string;

  before(() => {
    if (!existsSync(CLI)) {
      throw new Error('dist/linear-ops.js not built — run `npm run build` first');
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'validate-description-'));
    validFile = join(tmpDir, 'valid.md');
    invalidFile = join(tmpDir, 'invalid.md');
    writeFileSync(validFile, VALID_BODY);
    writeFileSync(invalidFile, 'too short and no AC heading');
  });

  it('exits 0 on a valid positional body', () => {
    const r = run([VALID_BODY]);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /valid/i);
  });

  it('exits 5 on an invalid positional body (default strict)', () => {
    const r = run(['too short']);
    assert.strictEqual(r.status, 5, `expected 5 got ${r.status}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /Acceptance Criteria/i);
  });

  it('exits 5 on an empty body', () => {
    const r = run(['']);
    assert.strictEqual(r.status, 5);
    assert.match(r.stderr, /empty/i);
  });

  it('exits 0 on a valid --file fixture', () => {
    const r = run(['--file', validFile]);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
  });

  it('exits 5 on an invalid --file fixture', () => {
    const r = run(['--file', invalidFile]);
    assert.strictEqual(r.status, 5);
    assert.match(r.stderr, /Acceptance Criteria/i);
  });

  it('exits 2 when --file points at a missing path', () => {
    const r = run(['--file', '/nonexistent/path/definitely-not-there.md']);
    assert.strictEqual(r.status, 2, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /Cannot read file/i);
  });

  it('exits 2 when no body / flag supplied', () => {
    const r = run([]);
    assert.strictEqual(r.status, 2);
    assert.match(r.stderr, /Usage/i);
  });

  it('--strict=false downgrades invalid body to exit 0', () => {
    const r = run(['--strict=false', 'too short']);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stderr, /downgraded/i);
  });

  it('accepts a valid body over stdin', () => {
    const r = run(['--stdin'], { input: VALID_BODY });
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
  });

  it('rejects an invalid body over stdin', () => {
    const r = run(['--stdin'], { input: 'not enough' });
    assert.strictEqual(r.status, 5);
  });

  it('does not require LINEAR_API_KEY', () => {
    // Re-assert the core contract: the command ran above with LINEAR_API_KEY=''
    // and still produced exit 0/5, not 1 (MISSING_API_KEY). One belt-and-braces
    // check: valid body with scrubbed env must still exit 0.
    const r = run([VALID_BODY]);
    assert.notStrictEqual(r.status, 1, 'must not fail with MISSING_API_KEY');
    assert.strictEqual(r.status, 0);
  });
});
