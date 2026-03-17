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
import { globSync } from 'node:fs';

const entryPoints = globSync('scripts/*.ts');

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
});

console.log(`Built ${entryPoints.length} entry points to dist/`);
