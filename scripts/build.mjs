#!/usr/bin/env node
/**
 * esbuild pre-compilation script
 *
 * Bundles all TypeScript entry points in scripts/ to dist/ for
 * faster CLI startup (eliminates tsx runtime compilation overhead).
 *
 * Usage:
 *   node scripts/build.mjs
 */
import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';

// Use readdirSync + filter instead of globSync (Node 22+) for compatibility
const entryPoints = readdirSync('scripts')
  .filter(f => f.endsWith('.ts'))
  .map(f => `scripts/${f}`);

await esbuild.build({
  entryPoints,
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'esm',
  outdir: 'dist',
  external: ['@linear/sdk'],
  sourcemap: false,
  minify: false,
  define: { '__BUNDLED__': 'true' },
});

console.log(`Built ${entryPoints.length} entry points to dist/`);

// Compile test files separately (same config minus __BUNDLED__ define)
const testDir = 'scripts/__tests__';
try {
  const testFiles = readdirSync(testDir)
    .filter(f => f.endsWith('.ts'))
    .map(f => `${testDir}/${f}`);

  if (testFiles.length > 0) {
    await esbuild.build({
      entryPoints: testFiles,
      bundle: true,
      platform: 'node',
      target: 'es2022',
      format: 'esm',
      outdir: 'dist/__tests__',
      external: ['@linear/sdk'],
      sourcemap: false,
      minify: false,
    });
    console.log(`Built ${testFiles.length} test files to dist/__tests__/`);
  }
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
