#!/usr/bin/env npx tsx
/**
 * Bulk-create Linear issues from a manifest directory + config file.
 *
 * Creates N issues in one team, each with a markdown description and optional
 * media files. Media is uploaded via Linear's fileUpload API and embedded in
 * the issue description (images inline, other files as links).
 *
 * Usage:
 *   LINEAR_API_KEY=xxx npx tsx scripts/bulk-create.ts \
 *     --manifest <dir> \
 *     --config <config.json>
 *
 * Preview without creating issues or uploading files:
 *   npx tsx scripts/bulk-create.ts \
 *     --manifest <dir> \
 *     --config <config.json> \
 *     --dry-run
 */

import { LinearClient } from '@linear/sdk';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { EXIT_CODES } from './lib/exit-codes.js';
import {
  findLabelIdsByName,
  findTeamByKey,
  findWorkflowStateIdByName,
  getLinearClient,
} from './lib/linear-utils.js';
import { withRetry } from './lib/retry.js';

interface Config {
  team_key: string;
  state_name?: string;
  default_priority?: number;
}

interface Ticket {
  key: string;
  title: string;
  priority?: number;
  labels?: string[];
  files?: string[];
}

interface Asset {
  url: string;
  name: string;
}

interface Args {
  manifest: string;
  config: string;
  dryRun: boolean;
  strict: boolean;
}

interface CreatedIssue {
  identifier: string;
  url: string;
  title: string;
}

interface Failure {
  key: string;
  title: string;
  error: string;
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
};

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

function printUsage(): void {
  console.error('Usage: npx tsx scripts/bulk-create.ts --manifest <dir> --config <config.json> [--dry-run] [--strict]');
  console.error('');
  console.error('Example:');
  console.error('  LINEAR_API_KEY=xxx npx tsx scripts/bulk-create.ts \\');
  console.error('    --manifest ./feedback-2026-04 \\');
  console.error('    --config ./feedback-2026-04/config.json');
}

function parseArgs(): Args {
  const rawArgs = process.argv.slice(2);
  const result: Partial<Args> = { dryRun: false, strict: false };

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const [flag, inlineValue] = arg.split('=', 2);

    switch (flag) {
      case '--manifest':
        result.manifest = inlineValue ?? rawArgs[++i];
        break;
      case '--config':
        result.config = inlineValue ?? rawArgs[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--strict':
      case '--strict=true':
        result.strict = true;
        break;
      case '--strict=false':
        result.strict = false;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(EXIT_CODES.SUCCESS);
        break;
      default:
        console.error(`[ERROR] Unknown argument: ${arg}`);
        printUsage();
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
  }

  if (!result.manifest || !result.config) {
    printUsage();
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  return result as Args;
}

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERROR] Cannot read JSON file "${path}": ${msg}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }
}

function validateConfig(config: Config): void {
  if (!config.team_key) {
    console.error('[ERROR] config.team_key is required');
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
  if (
    config.default_priority !== undefined &&
    (!Number.isInteger(config.default_priority) ||
      config.default_priority < 1 ||
      config.default_priority > 4)
  ) {
    console.error('[ERROR] config.default_priority must be an integer from 1 to 4');
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
}

function validateTickets(tickets: Ticket[]): void {
  if (!Array.isArray(tickets)) {
    console.error('[ERROR] tickets.json must contain an array');
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }

  for (const ticket of tickets) {
    if (!ticket.key || !ticket.title) {
      console.error('[ERROR] Every ticket requires key and title');
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
    if (
      ticket.priority !== undefined &&
      (!Number.isInteger(ticket.priority) || ticket.priority < 1 || ticket.priority > 4)
    ) {
      console.error(`[ERROR] Ticket "${ticket.key}" priority must be an integer from 1 to 4`);
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    }
  }
}

function ensureManifestPaths(args: Args): Ticket[] {
  if (!existsSync(args.manifest)) {
    console.error(`[ERROR] Manifest directory not found: ${args.manifest}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }
  if (!existsSync(args.config)) {
    console.error(`[ERROR] Config file not found: ${args.config}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  const ticketsPath = join(args.manifest, 'tickets.json');
  if (!existsSync(ticketsPath)) {
    console.error(`[ERROR] Missing ${ticketsPath}`);
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  const tickets = readJson<Ticket[]>(ticketsPath);
  validateTickets(tickets);
  return tickets;
}

function assertReferencedFilesExist(manifest: string, tickets: Ticket[]): void {
  const missing: string[] = [];
  for (const ticket of tickets) {
    for (const file of ticket.files ?? []) {
      const full = join(manifest, file);
      if (!existsSync(full)) {
        missing.push(`${ticket.key}: ${file}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('[ERROR] Manifest references missing file(s):');
    for (const file of missing) {
      console.error(`  - ${file}`);
    }
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
}

function printDryRun(config: Config, tickets: Ticket[], args: Args): void {
  console.log('DRY RUN: no Linear issues will be created and no files will be uploaded.');
  console.log(`Team: ${config.team_key}`);
  if (config.state_name) console.log(`State: ${config.state_name}`);
  if (config.default_priority !== undefined) {
    console.log(`Default priority: ${config.default_priority}`);
  }
  console.log(`Tickets: ${tickets.length}`);

  for (const ticket of tickets) {
    const descFile = join(args.manifest, `desc-${ticket.key}.md`);
    const descStatus = existsSync(descFile) ? 'description found' : 'no description file';
    const files = ticket.files?.length ? ticket.files.join(', ') : 'none';
    console.log(`  - ${ticket.key}: ${ticket.title}`);
    console.log(`    ${descStatus}; media: ${files}`);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function makeHttpError(message: string, status: number): Error {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

async function uploadAsset(client: LinearClient, path: string): Promise<Asset> {
  const size = statSync(path).size;
  const name = basename(path);
  const contentType = CONTENT_TYPES[extname(path).toLowerCase()] || 'application/octet-stream';

  const res = await withRetry(
    () => client.fileUpload(contentType, name, size),
    { label: `bulk-create:fileUpload:${name}` }
  );
  const uf = res.uploadFile;
  if (!uf) throw new Error(`fileUpload returned null for ${path}`);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
  };
  for (const h of uf.headers) headers[h.key] = h.value;

  await withRetry(
    async () => {
      const init: RequestInit & { duplex: 'half' } = {
        method: 'PUT',
        headers,
        body: createReadStream(path) as unknown as BodyInit,
        duplex: 'half',
      };
      const put = await fetch(uf.uploadUrl, init);
      if (!put.ok) {
        throw makeHttpError(`PUT ${path} failed: ${put.status} ${put.statusText}`, put.status);
      }
    },
    { label: `bulk-create:upload-put:${name}` }
  );

  return { url: uf.assetUrl, name };
}

function buildDescription(base: string, assets: Asset[]): string {
  if (assets.length === 0) return base;
  const blocks = assets.map(a =>
    IMAGE_EXT_RE.test(a.name)
      ? `![${a.name}](${a.url})`
      : `[${a.name}](${a.url})`
  );
  return `${base}\n\n## Attached media\n\n${blocks.join('\n\n')}\n`;
}

async function createTicket(
  client: LinearClient,
  args: Args,
  config: Config,
  teamId: string,
  stateId: string | null,
  ticket: Ticket
): Promise<CreatedIssue> {
  const assets: Asset[] = [];
  for (const file of ticket.files ?? []) {
    const full = join(args.manifest, file);
    if (!existsSync(full)) {
      throw new Error(`referenced file not found: ${file}`);
    }
    process.stdout.write(`  uploading ${file}... `);
    const asset = await uploadAsset(client, full);
    console.log('ok');
    assets.push(asset);
  }

  const descFile = join(args.manifest, `desc-${ticket.key}.md`);
  const baseDesc = existsSync(descFile) ? readFileSync(descFile, 'utf8') : '';
  const description = buildDescription(baseDesc, assets);

  const labelLookup = await findLabelIdsByName(client, teamId, ticket.labels ?? []);
  if (labelLookup.missing.length > 0) {
    const message = `labels not found: ${labelLookup.missing.join(', ')}`;
    if (args.strict) throw new Error(message);
    console.warn(`  warning: ${message}`);
  }

  const input: Parameters<LinearClient['createIssue']>[0] = {
    teamId,
    title: ticket.title,
    description,
  };
  if (stateId) input.stateId = stateId;
  const priority = ticket.priority ?? config.default_priority;
  if (priority !== undefined) input.priority = priority;
  if (labelLookup.ids.length > 0) input.labelIds = labelLookup.ids;

  const created = await withRetry(
    () => client.createIssue(input),
    { label: `bulk-create:createIssue:${ticket.key}` }
  );
  const issue = await created.issue;
  if (!issue) throw new Error('Linear createIssue returned no issue');

  return { identifier: issue.identifier, url: issue.url, title: ticket.title };
}

async function main() {
  const args = parseArgs();
  const config = readJson<Config>(args.config);
  validateConfig(config);
  const tickets = ensureManifestPaths(args);
  assertReferencedFilesExist(args.manifest, tickets);

  if (args.dryRun) {
    printDryRun(config, tickets, args);
    return;
  }

  let client: LinearClient;
  try {
    client = getLinearClient();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(EXIT_CODES.MISSING_API_KEY);
  }

  console.log(`Looking up team "${config.team_key}"...`);
  const team = await withRetry(
    () => findTeamByKey(client, config.team_key),
    { label: 'bulk-create:find-team' }
  );
  if (!team) {
    console.error(`[ERROR] Team "${config.team_key}" not found`);
    process.exit(EXIT_CODES.RESOURCE_NOT_FOUND);
  }

  let stateId: string | null = null;
  if (config.state_name) {
    stateId = await findWorkflowStateIdByName(client, team.id, config.state_name);
    if (!stateId) {
      const message = `state "${config.state_name}" not found in team ${team.key}`;
      if (args.strict) {
        console.error(`[ERROR] ${message}`);
        process.exit(EXIT_CODES.RESOURCE_NOT_FOUND);
      }
      console.warn(`  warning: ${message}`);
    }
  }

  const results: CreatedIssue[] = [];
  const failures: Failure[] = [];

  for (const ticket of tickets) {
    console.log(`\n[${ticket.key}] ${ticket.title}`);
    try {
      const issue = await createTicket(client, args, config, team.id, stateId, ticket);
      console.log(`  -> ${issue.identifier}  ${issue.url}`);
      results.push(issue);
    } catch (err) {
      const message = errorMessage(err);
      console.error(`  FAIL: ${message}`);
      failures.push({ key: ticket.key, title: ticket.title, error: message });
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Created ${results.length}/${tickets.length} issue(s)`);
  for (const r of results) {
    console.log(`  ${r.identifier}: ${r.title}`);
    console.log(`    ${r.url}`);
  }

  if (failures.length > 0) {
    console.log('\n=== FAILURES ===');
    for (const failure of failures) {
      console.log(`  ${failure.key}: ${failure.title}`);
      console.log(`    ${failure.error}`);
    }
    process.exit(EXIT_CODES.API_ERROR);
  }
}

main().catch(err => {
  console.error('[ERROR]', errorMessage(err));
  process.exit(EXIT_CODES.API_ERROR);
});
