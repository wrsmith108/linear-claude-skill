#!/usr/bin/env npx ts-node
/**
 * Linear Bulk Sync Script
 *
 * Synchronize code changes with Linear issues in bulk.
 * Handles issue status updates, project status, and verification.
 *
 * Usage:
 *   npx ts-node sync.ts --issues SMI-432,SMI-433 --state Done
 *   npx ts-node sync.ts --project "Phase 11" --state completed
 *   npx ts-node sync.ts --verify SMI-432,SMI-433 --expected-state Done
 *
 * Environment:
 *   LINEAR_API_KEY - Required for API access
 */

import https from 'https';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

if (!LINEAR_API_KEY) {
  console.error('ERROR: LINEAR_API_KEY environment variable is required');
  process.exit(1);
}

// Types
interface SyncResult {
  identifier: string;
  success: boolean;
  error?: string;
}

interface GraphQLResponse {
  data?: any;
  errors?: Array<{ message: string }>;
}

// Configuration
const RATE_LIMIT_DELAY = 100; // ms between API calls
const VERBOSE = process.argv.includes('--verbose');

/**
 * Execute GraphQL query against Linear API
 */
async function graphql(query: string): Promise<GraphQLResponse> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });

    const req = https.request({
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': LINEAR_API_KEY!
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Debug logging (only when --verbose flag is set)
 */
function debug(message: string): void {
  if (VERBOSE) {
    console.log(`[DEBUG] ${message}`);
  }
}

/**
 * Get workflow state ID by name (e.g., "Done" -> UUID)
 */
async function getWorkflowStateId(name: string): Promise<string> {
  debug(`Getting workflow state ID for "${name}"`);

  const result = await graphql(`{
    workflowStates {
      nodes { id name }
    }
  }`);

  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  const state = result.data.workflowStates.nodes.find(
    (s: any) => s.name.toLowerCase() === name.toLowerCase()
  );

  if (!state) {
    const available = result.data.workflowStates.nodes.map((s: any) => s.name).join(', ');
    throw new Error(`Workflow state "${name}" not found. Available: ${available}`);
  }

  debug(`State ID: ${state.id}`);
  return state.id;
}

/**
 * Get issue UUIDs from identifiers (e.g., ["SMI-432", "SMI-433"] -> Map)
 */
async function getIssueIds(identifiers: string[]): Promise<Map<string, string>> {
  const numbers = identifiers.map(i => parseInt(i.replace(/[A-Z]+-/i, ''), 10));
  debug(`Getting UUIDs for ${identifiers.length} issues: ${identifiers.join(', ')}`);

  const result = await graphql(`{
    issues(filter: { number: { in: [${numbers.join(',')}] } }) {
      nodes { id identifier state { name } }
    }
  }`);

  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  const map = new Map<string, string>();
  result.data.issues.nodes.forEach((i: any) => {
    map.set(i.identifier, i.id);
    debug(`  ${i.identifier} -> ${i.id} [${i.state.name}]`);
  });

  // Check for missing issues
  const found = new Set(result.data.issues.nodes.map((i: any) => i.identifier));
  const missing = identifiers.filter(id => !found.has(id));
  if (missing.length > 0) {
    console.warn(`⚠️  Issues not found: ${missing.join(', ')}`);
  }

  return map;
}

/**
 * Update a single issue's state
 */
async function updateIssue(id: string, stateId: string): Promise<boolean> {
  const result = await graphql(`
    mutation {
      issueUpdate(id: "${id}", input: { stateId: "${stateId}" }) {
        success
        issue { identifier state { name } }
      }
    }
  `);

  if (result.errors) {
    console.error(`GraphQL error: ${result.errors[0].message}`);
    return false;
  }

  return result.data?.issueUpdate?.success ?? false;
}

/**
 * Get project by name (partial match)
 */
async function findProject(name: string): Promise<{ id: string; name: string; state: string } | null> {
  debug(`Searching for project matching "${name}"`);

  const result = await graphql(`{
    projects(first: 50) {
      nodes { id name state }
    }
  }`);

  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  const project = result.data.projects.nodes.find(
    (p: any) => p.name.toLowerCase().includes(name.toLowerCase())
  );

  if (project) {
    debug(`Found: ${project.name} [${project.state}] - ${project.id}`);
  }

  return project || null;
}

/**
 * Update project status
 */
async function updateProjectStatus(id: string, state: string): Promise<boolean> {
  debug(`Updating project ${id} to state "${state}"`);

  const result = await graphql(`
    mutation {
      projectUpdate(id: "${id}", input: { state: "${state}" }) {
        success
        project { name state }
      }
    }
  `);

  if (result.errors) {
    console.error(`GraphQL error: ${result.errors[0].message}`);
    return false;
  }

  return result.data?.projectUpdate?.success ?? false;
}

/**
 * Bulk sync issues to a target state
 */
async function bulkSyncIssues(
  identifiers: string[],
  targetState: string
): Promise<SyncResult[]> {
  console.log(`\nSyncing ${identifiers.length} issues to "${targetState}"...\n`);

  const stateId = await getWorkflowStateId(targetState);
  const issueMap = await getIssueIds(identifiers);

  const results: SyncResult[] = [];

  for (const [identifier, id] of issueMap) {
    debug(`Updating ${identifier} (${id})`);
    const success = await updateIssue(id, stateId);

    if (success) {
      console.log(`✅ ${identifier} → ${targetState}`);
    } else {
      console.log(`❌ ${identifier} failed`);
    }

    results.push({ identifier, success });

    // Rate limit protection
    await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
  }

  return results;
}

/**
 * Verify issues are in expected state
 */
async function verifyIssues(
  identifiers: string[],
  expectedState: string
): Promise<{ passed: boolean; results: Array<{ identifier: string; state: string; match: boolean }> }> {
  console.log(`\nVerifying ${identifiers.length} issues are in "${expectedState}"...\n`);

  const numbers = identifiers.map(i => parseInt(i.replace(/[A-Z]+-/i, ''), 10));

  const result = await graphql(`{
    issues(filter: { number: { in: [${numbers.join(',')}] } }) {
      nodes { identifier state { name } }
    }
  }`);

  if (result.errors) {
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  const results = result.data.issues.nodes.map((i: any) => ({
    identifier: i.identifier,
    state: i.state.name,
    match: i.state.name.toLowerCase() === expectedState.toLowerCase()
  }));

  results.forEach((r: any) => {
    const icon = r.match ? '✅' : '❌';
    console.log(`${icon} ${r.identifier}: ${r.state}`);
  });

  const passed = results.every((r: any) => r.match);
  return { passed, results };
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  issues?: string[];
  state?: string;
  project?: string;
  projectId?: string;
  projectState?: string;
  verify?: string[];
  expectedState?: string;
  listProject?: string;
} {
  const args = process.argv.slice(2);
  const result: any = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--issues':
        result.issues = args[++i]?.split(',').map(s => s.trim());
        break;
      case '--state':
        result.state = args[++i];
        break;
      case '--project':
        result.project = args[++i];
        break;
      case '--project-id':
        result.projectId = args[++i];
        break;
      case '--project-state':
        result.projectState = args[++i];
        break;
      case '--verify':
        result.verify = args[++i]?.split(',').map(s => s.trim());
        break;
      case '--expected-state':
        result.expectedState = args[++i];
        break;
      case '--list-project':
        result.listProject = args[++i];
        break;
    }
  }

  return result;
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Linear Sync - Bulk synchronize code changes with Linear issues

USAGE:
  npx ts-node sync.ts [OPTIONS]

OPTIONS:
  --issues SMI-432,SMI-433    Comma-separated issue identifiers
  --state Done                Target workflow state for issues
  --project "Phase 11"        Project name (partial match)
  --project-id UUID           Project UUID (direct)
  --project-state completed   Target project state
  --verify SMI-432,SMI-433    Verify issues are in expected state
  --expected-state Done       Expected state for verification
  --list-project "Phase 11"   List all issues in a project
  --verbose                   Enable debug output

EXAMPLES:
  # Update issues to Done
  npx ts-node sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

  # Update project status
  npx ts-node sync.ts --project "Phase 11" --project-state completed

  # Combined: issues + project
  npx ts-node sync.ts --issues SMI-432,SMI-433 --state Done --project "Phase 11" --project-state completed

  # Verify sync completed
  npx ts-node sync.ts --verify SMI-432,SMI-433 --expected-state Done

ENVIRONMENT:
  LINEAR_API_KEY    Required. Your Linear API key.
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Show usage if no args
  if (Object.keys(args).length === 0) {
    printUsage();
    process.exit(0);
  }

  let exitCode = 0;

  try {
    // Handle issue sync
    if (args.issues && args.state) {
      const results = await bulkSyncIssues(args.issues, args.state);
      const success = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`\n${'═'.repeat(40)}`);
      console.log(`Synced: ${success}/${results.length} | Failed: ${failed}/${results.length}`);

      if (failed > 0) exitCode = 1;
    }

    // Handle project status update
    if (args.project || args.projectId) {
      const state = args.projectState || args.state;
      if (!state) {
        console.error('ERROR: --project-state or --state required with --project');
        process.exit(1);
      }

      let projectId = args.projectId;
      let projectName = args.project;

      if (!projectId && projectName) {
        const project = await findProject(projectName);
        if (!project) {
          console.error(`ERROR: Project matching "${projectName}" not found`);
          process.exit(1);
        }
        projectId = project.id;
        projectName = project.name;
      }

      const success = await updateProjectStatus(projectId!, state);
      if (success) {
        console.log(`\n✅ Project "${projectName || projectId}" → ${state}`);
      } else {
        console.log(`\n❌ Failed to update project status`);
        exitCode = 1;
      }
    }

    // Handle verification
    if (args.verify && args.expectedState) {
      const { passed } = await verifyIssues(args.verify, args.expectedState);

      console.log(`\n${'═'.repeat(40)}`);
      if (passed) {
        console.log(`✅ Verification passed: all issues in "${args.expectedState}"`);
      } else {
        console.log(`❌ Verification failed: some issues not in expected state`);
        exitCode = 1;
      }
    }

    // Handle list project issues
    if (args.listProject) {
      const project = await findProject(args.listProject);
      if (!project) {
        console.error(`ERROR: Project matching "${args.listProject}" not found`);
        process.exit(1);
      }

      const result = await graphql(`{
        project(id: "${project.id}") {
          name
          state
          issues {
            nodes { identifier title state { name } priority }
          }
        }
      }`);

      console.log(`\n=== ${result.data.project.name} [${result.data.project.state}] ===\n`);
      result.data.project.issues.nodes.forEach((i: any) => {
        const priority = i.priority ? `P${i.priority}` : 'P-';
        console.log(`  ${i.identifier}: ${i.title.substring(0, 50)} [${i.state.name}] ${priority}`);
      });
      console.log(`\nTotal: ${result.data.project.issues.nodes.length} issues`);
    }

  } catch (error) {
    console.error(`\nERROR: ${error instanceof Error ? error.message : error}`);
    exitCode = 1;
  }

  process.exit(exitCode);
}

// Run if executed directly
main();

// Export for use as module
export { bulkSyncIssues, updateProjectStatus, verifyIssues, findProject };
