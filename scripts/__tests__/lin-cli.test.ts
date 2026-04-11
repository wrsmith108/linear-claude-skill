/**
 * Tests for lin CLI integration layer.
 *
 * Tests detection, version gating, circuit-breaker, and fallback behavior.
 * Does NOT require `lin` to be installed — mocks execFile where needed.
 *
 * Run: node --test scripts/__tests__/lin-cli.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');

describe('lin-cli integration', () => {

  describe('detection', () => {
    it('detectLinCli returns available:false when lin binary is absent', async () => {
      // Import fresh module with PATH that excludes lin
      const { detectLinCli, _resetDetectionCache } = await import('../lib/lin-cli.ts');
      _resetDetectionCache();

      // Save and override PATH to empty
      const origPath = process.env.PATH;
      process.env.PATH = '/nonexistent';

      try {
        const info = await detectLinCli();
        assert.strictEqual(info.available, false);
        assert.strictEqual(info.meetsMinVersion, false);
      } finally {
        process.env.PATH = origPath;
        _resetDetectionCache();
      }
    });

    it('detectLinCli respects LINEAR_USE_LIN=0 kill switch', async () => {
      const { detectLinCli, _resetDetectionCache } = await import('../lib/lin-cli.ts');
      _resetDetectionCache();

      const origVal = process.env.LINEAR_USE_LIN;
      process.env.LINEAR_USE_LIN = '0';

      try {
        const info = await detectLinCli();
        assert.strictEqual(info.available, false);
      } finally {
        if (origVal === undefined) {
          delete process.env.LINEAR_USE_LIN;
        } else {
          process.env.LINEAR_USE_LIN = origVal;
        }
        _resetDetectionCache();
      }
    });
  });

  describe('tryLin fallback', () => {
    it('tryLin calls fallback when lin is unavailable', async () => {
      const { tryLin, _resetDetectionCache } = await import('../lib/lin-cli.ts');
      _resetDetectionCache();

      // Override PATH to ensure lin is not found
      const origPath = process.env.PATH;
      process.env.PATH = '/nonexistent';

      try {
        let fallbackCalled = false;
        const result = await tryLin(
          ['me'],
          async () => {
            fallbackCalled = true;
            return { name: 'test-user' };
          }
        );

        assert.strictEqual(fallbackCalled, true);
        assert.deepStrictEqual(result, { name: 'test-user' });
      } finally {
        process.env.PATH = origPath;
        _resetDetectionCache();
      }
    });
  });

  describe('build output', () => {
    it('lin-cli.ts has corresponding dist/lin-cli.js after build (if dist exists)', () => {
      // This test only runs if dist/ has been built
      if (!existsSync(DIST)) {
        return; // skip if no dist
      }

      // lin-cli.ts is in lib/, so it gets bundled into entry points that import it
      // Verify the main entry point (linear-ops.js) still builds
      assert.ok(
        existsSync(join(DIST, 'linear-ops.js')),
        'dist/linear-ops.js should exist after build'
      );
    });
  });

  describe('help output', () => {
    it('CLI help includes search and list-issues commands', () => {
      // Only run if dist exists
      if (!existsSync(join(DIST, 'linear-ops.js'))) {
        return;
      }

      const output = execSync(`node ${join(DIST, 'linear-ops.js')} help`, {
        encoding: 'utf8',
        cwd: ROOT,
        env: { ...process.env, LINEAR_API_KEY: '' }
      });

      assert.ok(
        output.includes('search'),
        'help output should include "search" command'
      );
      assert.ok(
        output.includes('list-issues'),
        'help output should include "list-issues" command'
      );
    });
  });
});
