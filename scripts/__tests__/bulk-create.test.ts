/**
 * Smoke tests for bulk-create.ts argument parsing and exit codes.
 *
 * Run: npm test (requires: npm run build)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..', '..');
const DIST = join(ROOT, 'dist');
const SCRIPT = join(DIST, 'bulk-create.js');

interface ExecError {
  status: number;
  stderr?: Buffer | string;
  stdout?: Buffer | string;
}

function runScript(args: string[], env: Record<string, string> = {}): ExecError {
  try {
    execSync(`node ${SCRIPT} ${args.join(' ')}`, {
      stdio: 'pipe',
      cwd: ROOT,
      env: { ...process.env, LINEAR_API_KEY: '', ...env },
    });
    return { status: 0 };
  } catch (err) {
    return err as ExecError;
  }
}

describe('bulk-create smoke tests', () => {
  let tmpDir: string;

  before(() => {
    if (!existsSync(SCRIPT)) {
      throw new Error('dist/bulk-create.js not built — run `npm run build` first');
    }
    tmpDir = mkdtempSync(join(tmpdir(), 'bulk-create-test-'));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits with INVALID_ARGUMENTS (2) when no args given', () => {
    const result = runScript([]);
    assert.strictEqual(result.status, 2, 'expected exit code 2 (INVALID_ARGUMENTS)');
  });

  it('exits with INVALID_ARGUMENTS (2) when manifest dir missing', () => {
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ team_key: 'ENG' }));
    const result = runScript([
      '--manifest', join(tmpDir, 'does-not-exist'),
      '--config', configPath,
    ]);
    assert.strictEqual(result.status, 2);
  });

  it('exits with INVALID_ARGUMENTS (2) when config file missing', () => {
    const result = runScript([
      '--manifest', tmpDir,
      '--config', join(tmpDir, 'nope.json'),
    ]);
    assert.strictEqual(result.status, 2);
  });

  it('exits with VALIDATION_ERROR (5) when config lacks team_key', () => {
    const manifestDir = mkdtempSync(join(tmpdir(), 'bulk-create-manifest-'));
    const configPath = join(manifestDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({}));
    writeFileSync(join(manifestDir, 'tickets.json'), '[]');
    const result = runScript([
      '--manifest', manifestDir,
      '--config', configPath,
    ]);
    rmSync(manifestDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 5, 'expected exit code 5 (VALIDATION_ERROR)');
  });

  it('exits with INVALID_ARGUMENTS (2) when tickets.json missing', () => {
    const manifestDir = mkdtempSync(join(tmpdir(), 'bulk-create-notickets-'));
    const configPath = join(manifestDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ team_key: 'ENG' }));
    const result = runScript([
      '--manifest', manifestDir,
      '--config', configPath,
    ]);
    rmSync(manifestDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 2);
  });

  it('exits with MISSING_API_KEY (1) when config is valid but LINEAR_API_KEY unset', () => {
    const manifestDir = mkdtempSync(join(tmpdir(), 'bulk-create-nokey-'));
    const configPath = join(manifestDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ team_key: 'ENG' }));
    writeFileSync(join(manifestDir, 'tickets.json'), '[]');
    const result = runScript([
      '--manifest', manifestDir,
      '--config', configPath,
    ]);
    rmSync(manifestDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 1, 'expected exit code 1 (MISSING_API_KEY)');
  });

  it('dry-run exits 0 without LINEAR_API_KEY for a valid manifest', () => {
    const manifestDir = mkdtempSync(join(tmpdir(), 'bulk-create-dryrun-'));
    const configPath = join(manifestDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ team_key: 'ENG' }));
    writeFileSync(join(manifestDir, 'tickets.json'), JSON.stringify([
      { key: 'one', title: 'First ticket' },
    ]));
    const result = runScript([
      '--manifest', manifestDir,
      '--config', configPath,
      '--dry-run',
    ]);
    rmSync(manifestDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 0);
  });

  it('dry-run validates referenced media files before any API work', () => {
    const manifestDir = mkdtempSync(join(tmpdir(), 'bulk-create-missing-file-'));
    const configPath = join(manifestDir, 'config.json');
    writeFileSync(configPath, JSON.stringify({ team_key: 'ENG' }));
    writeFileSync(join(manifestDir, 'tickets.json'), JSON.stringify([
      { key: 'one', title: 'First ticket', files: ['missing.png'] },
    ]));
    const result = runScript([
      '--manifest', manifestDir,
      '--config', configPath,
      '--dry-run',
    ]);
    rmSync(manifestDir, { recursive: true, force: true });
    assert.strictEqual(result.status, 5);
  });
});
