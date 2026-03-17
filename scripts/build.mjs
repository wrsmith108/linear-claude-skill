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
