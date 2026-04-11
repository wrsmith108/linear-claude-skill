#!/usr/bin/env npx tsx
/**
 * Linear Skill Setup Check
 *
 * Run this script to verify your Linear skill configuration:
 *   npx tsx setup.ts
 *
 * Or with silent mode (for postinstall):
 *   npx tsx setup.ts --silent
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import { parseLinVersion } from './lib';

interface SetupResult {
  ready: boolean;
  issues: string[];
  suggestions: string[];
}

const SILENT = process.argv.includes('--silent');

function log(...args: unknown[]) {
  if (!SILENT) console.log(...args);
}

function logError(...args: unknown[]) {
  console.error(...args);
}

async function checkLinearApiKey(): Promise<{ valid: boolean; issues: string[]; suggestions: string[] }> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    issues.push('LINEAR_API_KEY not set');
    suggestions.push(
      'Get your API key:',
      '  1. Open Linear (https://linear.app)',
      '  2. Go to Settings (gear icon) -> Security & access -> Personal API keys',
      '  3. Click "Create key" and copy the key',
      '',
      'Then set it in your environment:',
      '  Option A: Add to shell profile (~/.zshrc or ~/.bashrc):',
      '    export LINEAR_API_KEY="lin_api_..."',
      '',
      '  Option B: Add to Claude Code environment (~/.claude/.env):',
      '    LINEAR_API_KEY=lin_api_...',
      '',
      '  Option C: Add to project .env file:',
      '    LINEAR_API_KEY=lin_api_...'
    );
    return { valid: false, issues, suggestions };
  }

  // Validate key format
  if (!apiKey.startsWith('lin_api_')) {
    issues.push('LINEAR_API_KEY has invalid format (should start with lin_api_)');
    suggestions.push('Regenerate your API key in Linear settings');
    return { valid: false, issues, suggestions };
  }

  // Test the key works
  try {
    const { LinearClient } = await import('@linear/sdk');
    const client = new LinearClient({ apiKey });
    const me = await client.viewer;
    const org = await me.organization;

    log(`  Authenticated as: ${me.name} (${me.email})`);
    log(`  Organization: ${org?.name || 'Unknown'}`);

    return { valid: true, issues: [], suggestions: [] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('401') || msg.includes('unauthorized')) {
      issues.push('LINEAR_API_KEY is invalid or expired');
      suggestions.push(
        'Your API key is not working. To fix:',
        '  1. Go to Linear -> Settings -> Security & access -> Personal API keys',
        '  2. Delete the old key and create a new one',
        '  3. Update your environment variable'
      );
    } else {
      issues.push(`API connection failed: ${msg}`);
      suggestions.push('Check your network connection and try again');
    }
    return { valid: false, issues, suggestions };
  }
}

async function checkSdkInstalled(): Promise<{ installed: boolean; issues: string[]; suggestions: string[] }> {
  try {
    await import('@linear/sdk');
    return { installed: true, issues: [], suggestions: [] };
  } catch {
    return {
      installed: false,
      issues: ['@linear/sdk not installed'],
      suggestions: [
        'Install the Linear SDK:',
        '  npm install @linear/sdk  # Run from the skill directory'
      ]
    };
  }
}

function checkLinearDesktopCli(): { installed: boolean; path?: string } {
  try {
    execSync('linear --version', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return { installed: true };
  } catch {
    return { installed: false };
  }
}

function checkLinCli(): { installed: boolean; version?: string } {
  try {
    const output = execSync('lin --version', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return { installed: true, version: parseLinVersion(output) };
  } catch {
    return { installed: false };
  }
}

function checkMcpConfig(): { found: boolean; hasLinear: boolean; path?: string } {
  const searchPaths = [
    join(process.cwd(), '.mcp.json'),
    join(homedir(), '.mcp.json'),
    join(homedir(), '.claude', '.mcp.json')
  ];

  for (const mcpPath of searchPaths) {
    if (existsSync(mcpPath)) {
      try {
        const content = readFileSync(mcpPath, 'utf8');
        const config = JSON.parse(content);
        const hasLinear = !!(config.mcpServers?.linear || config.servers?.linear);
        return { found: true, hasLinear, path: mcpPath };
      } catch {
        return { found: true, hasLinear: false, path: mcpPath };
      }
    }
  }

  return { found: false, hasLinear: false };
}

async function runSetupCheck(): Promise<SetupResult> {
  const allIssues: string[] = [];
  const allSuggestions: string[] = [];

  log('\n========================================');
  log('  Linear Skill Setup Check');
  log('========================================\n');

  // 1. Check @linear/sdk
  log('Checking @linear/sdk...');
  const sdkResult = await checkSdkInstalled();
  if (sdkResult.installed) {
    log('  [OK] @linear/sdk is installed\n');
  } else {
    log('  [MISSING] @linear/sdk not found\n');
    allIssues.push(...sdkResult.issues);
    allSuggestions.push(...sdkResult.suggestions, '');
  }

  // 2. Check LINEAR_API_KEY (only if SDK is installed)
  log('Checking LINEAR_API_KEY...');
  if (sdkResult.installed) {
    const apiResult = await checkLinearApiKey();
    if (apiResult.valid) {
      log('  [OK] API key is valid\n');
    } else {
      log('  [MISSING/INVALID] API key issue\n');
      allIssues.push(...apiResult.issues);
      allSuggestions.push(...apiResult.suggestions, '');
    }
  } else {
    if (process.env.LINEAR_API_KEY) {
      log('  [SET] LINEAR_API_KEY is set (cannot validate without SDK)\n');
    } else {
      log('  [MISSING] LINEAR_API_KEY not set\n');
      allIssues.push('LINEAR_API_KEY not set');
      allSuggestions.push(
        'After installing SDK, set your API key (see instructions above)',
        ''
      );
    }
  }

  // 3. Check Linear Desktop CLI (optional)
  log('Checking Linear Desktop CLI (optional)...');
  const cliResult = checkLinearDesktopCli();
  if (cliResult.installed) {
    log('  [OK] Linear Desktop CLI found\n');
  } else {
    log('  [INFO] Linear Desktop CLI not installed (optional)\n');
    log('  To install: Download Linear Desktop from https://linear.app/download\n');
  }

  // 3b. Check lin CLI (optional fast-path)
  log('Checking lin CLI (optional fast-path)...');
  const linResult = checkLinCli();
  if (linResult.installed) {
    log(`  [OK] lin v${linResult.version} found`);
    log('       Enables faster execution + search/list-issues commands\n');
  } else {
    log('  [INFO] lin CLI not installed (optional)');
    log('         Enables faster execution for status updates, listings, and search');
    log('  To install: brew install aaronkwhite/tap/lin\n');
  }

  // 4. Check MCP configuration (optional)
  log('Checking MCP configuration (optional)...');
  const mcpResult = checkMcpConfig();
  if (mcpResult.found && mcpResult.hasLinear) {
    log(`  [OK] Linear MCP configured in ${mcpResult.path}\n`);
  } else if (mcpResult.found) {
    log(`  [INFO] .mcp.json found but Linear not configured\n`);
    log('  To add Linear MCP, add to your .mcp.json:\n');
    log('  {');
    log('    "mcpServers": {');
    log('      "linear": {');
    log('        "command": "npx",');
    log('        "args": ["-y", "linear-mcp-server"],');
    log('        "env": { "LINEAR_API_KEY": "${LINEAR_API_KEY}" }');
    log('      }');
    log('    }');
    log('  }\n');
  } else {
    log('  [INFO] No .mcp.json found (MCP tools will not be available)\n');
  }

  // Summary
  log('========================================');
  if (allIssues.length === 0) {
    log('  STATUS: Ready to use!');
    log('========================================\n');
    log('Quick commands:');
    log('  - Create initiative: npx tsx scripts/linear-ops.ts create-initiative "Name"');
    log('  - Update status:     node scripts/linear-helpers.mjs update-status Done 123');
    log('  - Query API:         npx tsx scripts/query.ts "query { viewer { name } }"');
    log('');
    return { ready: true, issues: [], suggestions: [] };
  } else {
    log('  STATUS: Setup incomplete');
    log('========================================\n');

    log('Issues found:');
    allIssues.forEach(issue => log(`  - ${issue}`));
    log('');

    log('To fix:');
    allSuggestions.forEach(s => log(`  ${s}`));

    return { ready: false, issues: allIssues, suggestions: allSuggestions };
  }
}

// Main
runSetupCheck()
  .then(result => {
    process.exit(result.ready ? 0 : 1);
  })
  .catch(error => {
    logError('Setup check failed:', error.message);
    process.exit(1);
  });
