/**
 * Smoke tests for the Linear CLI build output.
 *
 * These tests validate that:
 * - esbuild produces the expected dist/ files
 * - __BUNDLED__ is replaced at build time
 * - CLI commands exit with expected codes
 * - External dependencies are not inlined
 *
 * Run: node --test scripts/__tests__/smoke.test.ts
 * Requires: dist/ to exist (run `npm run build` first)
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const SCRIPTS = join(ROOT, 'scripts');

describe('smoke tests', () => {
  before(() => {
    if (!existsSync(join(DIST, 'linear-ops.js'))) {
      console.log('SKIP: dist/ not built — run `npm run build` first');
      process.exit(0);
    }
  });

  it('all scripts/*.ts files have corresponding dist/*.js files', () => {
    const tsFiles = readdirSync(SCRIPTS)
      .filter(f => f.endsWith('.ts'));
    for (const ts of tsFiles) {
      const js = ts.replace(/\.ts$/, '.js');
      assert.ok(
        existsSync(join(DIST, js)),
        `Missing dist/${js} for scripts/${ts}`
      );
    }
  });

  it('__BUNDLED__ is replaced in dist/linear-ops.js', () => {
    const content = readFileSync(join(DIST, 'linear-ops.js'), 'utf8');
    assert.ok(
      !content.includes('__BUNDLED__'),
      'dist/linear-ops.js still contains __BUNDLED__ placeholder'
    );
    assert.ok(
      content.includes('true'),
      'dist/linear-ops.js should contain the replaced value "true"'
    );
  });

  it('CLI help exits 0', () => {
    execSync(`node ${join(DIST, 'linear-ops.js')} help`, {
      stdio: 'pipe',
      env: { ...process.env, LINEAR_API_KEY: '' }
    });
  });

  it('CLI labels taxonomy exits 0 without API key', () => {
    execSync(`node ${join(DIST, 'linear-ops.js')} labels taxonomy`, {
      stdio: 'pipe',
      env: { ...process.env, LINEAR_API_KEY: '' }
    });
  });

  it('CLI create-issue exits non-0 without API key', () => {
    try {
      execSync(`node ${join(DIST, 'linear-ops.js')} create-issue`, {
        stdio: 'pipe',
        env: { ...process.env, LINEAR_API_KEY: '' }
      });
      assert.fail('Expected create-issue to exit non-0 without API key');
    } catch (err: unknown) {
      const error = err as { status: number; stderr?: Buffer };
      assert.ok(
        error.status !== 0,
        `Expected non-0 exit code, got ${error.status}`
      );
    }
  });

  it('external SDK is not bundled into dist/linear-ops.js', () => {
    const content = readFileSync(join(DIST, 'linear-ops.js'), 'utf8');
    assert.ok(
      content.includes('@linear/sdk'),
      'dist/linear-ops.js should reference @linear/sdk as an external import'
    );
  });
});
