#!/usr/bin/env npx tsx
/**
 * Lint Issues — retroactive audit for Acceptance Criteria compliance.
 *
 * Scans Linear issues and reports any whose description fails the AC
 * contract enforced by `validate-description` / `create-issue`. Mutates
 * nothing — suitable for CI or local spot-checks.
 *
 * Usage:
 *   npm run lint-issues -- --since 7d
 *   npm run lint-issues -- --project "My Project"
 *   npm run lint-issues -- --since 24h --project "My Project" --json
 *
 * Flags:
 *   --since <duration>   Only issues created within <duration> (e.g. 24h, 7d, 30d)
 *   --project <name>     Only issues in the named project (case-insensitive)
 *   --limit <n>          Max issues to scan (default 200, cap 1000)
 *   --json               Emit JSON instead of a human-readable table
 *
 * At least one of --since / --project is required.
 *
 * Exit codes:
 *   0   All scanned issues pass validation
 *   1   Missing LINEAR_API_KEY
 *   2   Invalid arguments
 *   5   One or more issues failed validation
 */

import { EXIT_CODES } from './lib/exit-codes.js';
import { getLinearClient, validateIssueDescription } from './lib';

interface LintFinding {
  identifier: string;
  title: string;
  url: string;
  errors: string[];
  warnings: string[];
}

function parseDuration(input: string): Date | null {
  const m = input.match(/^(\d+)([smhdw])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  const ms =
    unit === 's' ? n * 1000 :
    unit === 'm' ? n * 60_000 :
    unit === 'h' ? n * 3_600_000 :
    unit === 'd' ? n * 86_400_000 :
    unit === 'w' ? n * 604_800_000 :
    0;
  return new Date(Date.now() - ms);
}

function usage(): never {
  console.error('Usage: lint-issues --since <duration> | --project <name> [--limit N] [--json]');
  console.error('');
  console.error('Scans Linear issues for AC-contract violations without mutating anything.');
  console.error('');
  console.error('Flags:');
  console.error('  --since <duration>   Duration string like 24h, 7d, 30d');
  console.error('  --project <name>     Project name (case-insensitive substring match)');
  console.error('  --limit N            Max issues to scan (default 200, cap 1000)');
  console.error('  --json               Output JSON array instead of a table');
  console.error('');
  console.error('Exit: 0 = all valid, 5 = failures found, 2 = bad args, 1 = missing API key.');
  process.exit(EXIT_CODES.INVALID_ARGUMENTS);
}

async function main() {
  const args = process.argv.slice(2);

  let since: string | undefined;
  let projectName: string | undefined;
  let limit = 200;
  let emitJson = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--since' && args[i + 1]) {
      since = args[++i];
    } else if (a === '--project' && args[i + 1]) {
      projectName = args[++i];
    } else if (a === '--limit' && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`[ERROR] --limit must be a positive integer, got: ${args[i]}`);
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }
      limit = Math.min(n, 1000);
    } else if (a === '--json') {
      emitJson = true;
    } else if (a === '--help' || a === '-h') {
      usage();
    } else {
      console.error(`[ERROR] Unknown argument: ${a}`);
      usage();
    }
  }

  if (!since && !projectName) {
    console.error('[ERROR] At least one of --since or --project is required.');
    usage();
  }

  let cutoff: Date | undefined;
  if (since) {
    const parsed = parseDuration(since);
    if (!parsed) {
      console.error(`[ERROR] Invalid --since value: "${since}" (expected e.g. 24h, 7d, 30d)`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
    cutoff = parsed;
  }

  let client;
  try {
    client = getLinearClient();
  } catch {
    console.error('[ERROR] LINEAR_API_KEY environment variable is required');
    process.exit(EXIT_CODES.MISSING_API_KEY);
  }

  // Build filter. Linear's SDK accepts a structured filter object.
  const filter: Record<string, unknown> = {};
  if (cutoff) {
    filter.createdAt = { gt: cutoff.toISOString() };
  }
  if (projectName) {
    const projects = await client.projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });
    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
    filter.project = { id: { eq: projects.nodes[0].id } };
    if (!emitJson) {
      console.error(`Scanning project: ${projects.nodes[0].name}`);
    }
  }

  if (!emitJson) {
    const scope: string[] = [];
    if (cutoff) scope.push(`since ${cutoff.toISOString()}`);
    if (projectName) scope.push(`project=${projectName}`);
    console.error(`Scanning up to ${limit} issues (${scope.join(', ')})...`);
  }

  // For Linear Issue type, `description` is the full markdown body (not
  // truncated like Project.description vs Project.content). Validate
  // against whatever the SDK returns, defaulting to empty string.
  const issues = await client.issues({ first: limit, filter });

  const findings: LintFinding[] = [];
  for (const issue of issues.nodes) {
    const body = issue.description ?? '';
    const result = validateIssueDescription(body);
    if (!result.valid || result.warnings.length > 0) {
      findings.push({
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        errors: result.errors,
        warnings: result.warnings,
      });
    }
  }

  const failures = findings.filter(f => f.errors.length > 0);

  if (emitJson) {
    console.log(JSON.stringify({
      scanned: issues.nodes.length,
      failures: failures.length,
      warningsOnly: findings.length - failures.length,
      findings,
    }, null, 2));
  } else {
    console.log(`Scanned ${issues.nodes.length} issue(s). Failures: ${failures.length}. Warnings-only: ${findings.length - failures.length}.`);
    console.log('');

    if (findings.length === 0) {
      console.log('✓ All scanned issues pass validation.');
    } else {
      const header = `${'ID'.padEnd(10)}  ${'Title'.padEnd(40)}  Issue`;
      console.log(header);
      console.log('-'.repeat(header.length));
      for (const f of findings) {
        const title = f.title.length > 38 ? f.title.slice(0, 37) + '…' : f.title;
        const reason = f.errors[0] ?? f.warnings[0] ?? '(no detail)';
        const reasonShort = reason.length > 80 ? reason.slice(0, 77) + '...' : reason;
        const flag = f.errors.length > 0 ? '✗' : '⚠';
        console.log(`${flag} ${f.identifier.padEnd(8)}  ${title.padEnd(40)}  ${reasonShort}`);
        console.log(`  ${f.url}`);
      }
    }
  }

  if (failures.length > 0) {
    process.exit(EXIT_CODES.VALIDATION_ERROR);
  }
}

main().catch(err => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ERROR] ${msg}`);
  process.exit(EXIT_CODES.API_ERROR);
});
