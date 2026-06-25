#!/usr/bin/env npx tsx
/**
 * Linear High-Level Operations
 *
 * Simple commands for common Linear operations without needing to understand the API.
 *
 * Usage:
 *   npx tsx linear-ops.ts <command> [args]
 *
 * Commands:
 *   create-issue <project> <title> [desc]    Create an issue in a project
 *   create-sub-issue <parent> <title> [desc] Create a sub-issue under a parent issue
 *   set-parent <parent> <child-issues...>    Set parent-child relationships
 *   list-sub-issues <parent>                 List sub-issues of a parent
 *   create-initiative <name> [description]   Create a new initiative
 *   create-project <name> [initiative]       Create a project (optionally linked to initiative)
 *   create-project-update <project> <body>   Create a project update
 *   create-initiative-update <init> <body>   Create an initiative update
 *   add-link <project|initiative> <url> <label>  Add external link to project or initiative
 *   status <state> <issue-numbers...>        Update issue status (Done, In Progress, etc.)
 *   update-issue <issue-id> <field> <value>  Update issue title or description
 *   list-initiatives                         List all initiatives
 *   list-projects [initiative]               List projects (optionally filter by initiative)
 *   setup                                    Check setup and configuration
 *   whoami                                   Show current user and organization
 *   search <query>                           Search issues across workspace
 *   list-issues [--team X] [--state Y]       List issues with optional filters
 */

// Defined at build time by esbuild (see scripts/build.mjs)
declare const __BUNDLED__: boolean | undefined;

import {
  LinearClient,
  ProjectUpdateHealthType,
  InitiativeUpdateHealthType,
  type Issue
} from '@linear/sdk';
import { EXIT_CODES } from './lib/exit-codes.js';
import {
  getAllLabels,
  getLabelsByCategory,
  validateLabels,
  suggestLabels,
  selectAgentsForIssue,
  formatValidationResult,
  formatSuggestions,
  formatAgentSelection,
  formatAgentMatrix,
  getLinearClient,
  tryLin,
  isLinCliAvailable,
  linUpdateIssueState,
  validateIssueDescription,
  buildIssueTemplate,
  formatDescriptionValidationResult,
  formatWarningsOnly,
  isStrictMode
} from './lib';

// Lazy API key validation and client creation
// Commands that don't need the API (help, labels taxonomy/validate/suggest/agents/matrix)
// can run without LINEAR_API_KEY being set.
function requireApiKey(): string {
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    console.error('\n[ERROR] LINEAR_API_KEY environment variable is required\n');
    console.error('To fix this:');
    console.error('  1. Go to Linear -> Settings -> Security & access -> Personal API keys');
    console.error('  2. Create a new API key');
    console.error('  3. Run: export LINEAR_API_KEY="lin_api_..."');
    console.error('\nOr run setup to check all requirements:');
    console.error('  npx tsx setup.ts\n');
    process.exit(1);
  }
  return key;
}

function requireClient(): LinearClient {
  try {
    return getLinearClient();
  } catch {
    // Provide the friendly error message with setup instructions
    console.error('\n[ERROR] LINEAR_API_KEY environment variable is required\n');
    console.error('To fix this:');
    console.error('  1. Go to Linear -> Settings -> Security & access -> Personal API keys');
    console.error('  2. Create a new API key');
    console.error('  3. Run: export LINEAR_API_KEY="lin_api_..."');
    console.error('\nOr run setup to check all requirements:');
    console.error('  npx tsx setup.ts\n');
    process.exit(1);
  }
}

type UpdateIssueField = 'title' | 'description';

interface ParsedUpdateIssueValue {
  value: string;
  force: boolean;
  strictFlag?: boolean;
}

const ISSUE_IDENTIFIER_RE = /^([A-Z][A-Z0-9]*)-(\d+)$/i;
const ISSUE_NUMBER_RE = /^\d+$/;

function usageUpdateIssue(): void {
  console.error('Usage: update-issue <issue-id> <field> <value> [--force] [--strict=false]');
  console.error('       update-issue <issue-id> description --file <path> --force');
  console.error('       update-issue <issue-id> description --stdin --force');
  console.error('Fields: title, description');
  console.error('Example: update-issue ENG-123 description "New description text" --force');
  console.error('Example: update-issue ENG-123 title "Corrected title" --force');
}

function previewText(value: string | null | undefined, max = 500): string {
  const text = value?.trim() || '(empty)';
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

async function readStdinUtf8(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function parseUpdateIssueValue(
  field: UpdateIssueField,
  valueParts: string[]
): Promise<ParsedUpdateIssueValue> {
  let force = false;
  let strictFlag: boolean | undefined;
  let filePath: string | undefined;
  let readStdin = false;
  const valueTokens: string[] = [];

  for (let i = 0; i < valueParts.length; i++) {
    const part = valueParts[i];
    if (part === '--force') {
      force = true;
    } else if (part === '--strict=false') {
      strictFlag = false;
    } else if (part === '--strict=true') {
      strictFlag = true;
    } else if (part === '--file') {
      if (!valueParts[i + 1]) {
        console.error('[ERROR] --file requires a path');
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }
      filePath = valueParts[i + 1];
      i++;
    } else if (part === '--stdin') {
      readStdin = true;
    } else if (part.startsWith('--')) {
      console.error(`[ERROR] Unknown flag: ${part}`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    } else {
      valueTokens.push(part);
    }
  }

  if ((filePath || readStdin) && field !== 'description') {
    console.error('[ERROR] --file and --stdin are only supported for description updates');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }
  if (filePath && readStdin) {
    console.error('[ERROR] Use either --file or --stdin, not both');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }
  if ((filePath || readStdin) && valueTokens.length > 0) {
    console.error('[ERROR] Provide the description either positionally, with --file, or with --stdin');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  let value: string;
  if (filePath) {
    const { readFileSync } = await import('node:fs');
    try {
      value = readFileSync(filePath, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ERROR] Cannot read file "${filePath}": ${msg}`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }
  } else if (readStdin) {
    value = await readStdinUtf8();
  } else {
    value = valueTokens.join(' ');
  }

  if (value.length === 0) {
    console.error('[ERROR] Update value is required');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  return { value, force, strictFlag };
}

async function resolveIssueForUpdate(
  client: LinearClient,
  issueIdentifier: string
): Promise<Issue> {
  const trimmed = issueIdentifier.trim();
  const fullIdentifier = trimmed.match(ISSUE_IDENTIFIER_RE);

  if (fullIdentifier) {
    const normalized = `${fullIdentifier[1].toUpperCase()}-${parseInt(fullIdentifier[2], 10)}`;
    try {
      return await client.issue(normalized);
    } catch {
      console.error(`[ERROR] Issue ${normalized} not found`);
      process.exit(EXIT_CODES.RESOURCE_NOT_FOUND);
    }
  }

  if (!ISSUE_NUMBER_RE.test(trimmed)) {
    console.error(`[ERROR] "${issueIdentifier}" is not a valid issue identifier`);
    console.error('Use a full identifier like ENG-123, or a bare number like 123 in single-team workspaces.');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  const issueNum = parseInt(trimmed, 10);
  const issues = await client.issues({ first: 25, filter: { number: { eq: issueNum } } });

  if (issues.nodes.length === 0) {
    console.error(`[ERROR] Issue #${issueNum} not found`);
    console.error('If your workspace has multiple teams, pass the full identifier, e.g. ENG-123.');
    process.exit(EXIT_CODES.RESOURCE_NOT_FOUND);
  }

  if (issues.nodes.length > 1) {
    const candidates = issues.nodes.map(issue => issue.identifier).join(', ');
    console.error(`[ERROR] Multiple issues match #${issueNum}: ${candidates}`);
    console.error('Pass the full identifier, e.g. ENG-123.');
    process.exit(EXIT_CODES.INVALID_ARGUMENTS);
  }

  return issues.nodes[0];
}

async function confirmIssueUpdate(
  issue: Issue,
  field: UpdateIssueField,
  value: string
): Promise<void> {
  console.log(`Current ${field} on ${issue.identifier}:`);
  console.log(previewText(field === 'title' ? issue.title : issue.description));
  console.log('');
  console.log(`New ${field}:`);
  console.log(previewText(value));
  console.log('');

  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Replace ${field} on ${issue.identifier}? [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.error('[ERROR] Update cancelled');
      process.exit(EXIT_CODES.PERMISSION_DENIED);
    }
  } finally {
    rl.close();
  }
}

// Command implementations
const commands: Record<string, (...args: string[]) => Promise<void>> = {

  async 'create-issue'(projectName: string, title: string, description?: string, ...flags: string[]) {
    // --template short-circuit: no project/title required, just print template and exit
    const allArgs = [projectName, title, description, ...flags].filter((a): a is string => typeof a === 'string');
    if (allArgs.includes('--template')) {
      process.stdout.write(buildIssueTemplate(title && title !== '--template' ? title : undefined));
      return;
    }

    if (!projectName || !title) {
      console.error('Usage: create-issue <project-name> <title> [description] [--priority 1-4] [--labels label1,label2] [--strict=false]');
      console.error('Example: create-issue "My Project" "Fix login bug" "Users cannot log in..."');
      console.error('\nPriority: 1=urgent, 2=high, 3=medium, 4=low (default: 3)');
      console.error('Print template: create-issue --template');
      process.exit(1);
    }

    // Parse flags
    let priority = 3;
    let labelNames: string[] = [];
    let strictFlag: boolean | undefined;

    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--priority' && flags[i + 1]) {
        priority = parseInt(flags[i + 1], 10);
        i++;
      } else if (flags[i] === '--labels' && flags[i + 1]) {
        labelNames = flags[i + 1].split(',').map(l => l.trim());
        i++;
      } else if (flags[i] === '--strict=false') {
        strictFlag = false;
      } else if (flags[i] === '--strict=true') {
        strictFlag = true;
      }
    }

    // Validate description BEFORE any API work (runs before tryLin too, so the
    // lin-CLI fast-path is also gated).
    const descResult = validateIssueDescription(description ?? '');
    if (!descResult.valid || descResult.warnings.length > 0) {
      const strict = isStrictMode(strictFlag);
      const output = formatDescriptionValidationResult(descResult);
      if (!descResult.valid && strict) {
        console.error(output);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      } else if (!descResult.valid) {
        console.warn('[WARN] Description validation downgraded (strict mode off):');
        console.warn(output);
      } else if (descResult.warnings.length > 0) {
        console.warn(formatWarningsOnly(descResult));
      }
    }

    console.log(`Creating issue in project: ${projectName}...`);

    // Find project by name
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });

    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(1);
    }

    const project = projects.nodes[0];
    console.log(`  Found project: ${project.name}`);

    // Get team from project
    const teams = await requireClient().teams();
    if (teams.nodes.length === 0) {
      console.error('[ERROR] No teams found in your workspace');
      process.exit(1);
    }
    const team = teams.nodes[0];
    console.log(`  Using team: ${team.name}`);

    // Resolve label names to IDs if provided
    const labelIds: string[] = [];
    if (labelNames.length > 0) {
      const labels = await team.labels();
      for (const name of labelNames) {
        const label = labels.nodes.find(l =>
          l.name.toLowerCase() === name.toLowerCase()
        );
        if (label) {
          labelIds.push(label.id);
          console.log(`  Found label: ${label.name}`);
        } else {
          console.log(`  [WARNING] Label "${name}" not found, skipping`);
        }
      }
    }

    const result = await requireClient().createIssue({
      teamId: team.id,
      projectId: project.id,
      title,
      description: description || '',
      priority,
      ...(labelIds.length > 0 && { labelIds })
    });

    const issue = await result.issue;
    if (issue) {
      console.log('\n[SUCCESS] Issue created!');
      console.log(`  ID:       ${issue.identifier}`);
      console.log(`  Title:    ${issue.title}`);
      console.log(`  Priority: ${priority}`);
      console.log(`  Project:  ${project.name}`);
      console.log(`  URL:      ${issue.url}`);
    } else {
      console.error('[ERROR] Failed to create issue');
      process.exit(1);
    }
  },

  async 'create-initiative'(name: string, description?: string) {
    if (!name) {
      console.error('Usage: create-initiative <name> [description]');
      console.error('Example: create-initiative "Q1 2025 Goals" "Key initiatives for Q1"');
      process.exit(1);
    }

    console.log(`Creating initiative: ${name}...`);

    const me = await requireClient().viewer;
    const result = await requireClient().createInitiative({
      name,
      description: description || `Initiative: ${name}`,
      ownerId: me.id
    });

    const initiative = await result.initiative;
    if (initiative) {
      // Get the URL by querying the initiative
      const initiatives = await requireClient().initiatives({ filter: { id: { eq: initiative.id } } });
      const url = initiatives.nodes[0]?.url || `https://linear.app/initiative/${initiative.id}`;

      console.log('\n[SUCCESS] Initiative created!');
      console.log(`  Name: ${initiative.name}`);
      console.log(`  ID:   ${initiative.id}`);
      console.log(`  URL:  ${url}`);
    } else {
      console.error('[ERROR] Failed to create initiative');
      process.exit(1);
    }
  },

  async 'create-project'(name: string, initiativeName?: string) {
    if (!name) {
      console.error('Usage: create-project <name> [initiative-name]');
      console.error('Example: create-project "Phase 1: Foundation" "Q1 2025 Goals"');
      process.exit(1);
    }

    console.log(`Creating project: ${name}...`);

    // Get first team (required for project)
    const teams = await requireClient().teams();
    if (teams.nodes.length === 0) {
      console.error('[ERROR] No teams found in your workspace');
      process.exit(1);
    }
    const team = teams.nodes[0];
    console.log(`  Using team: ${team.name}`);

    // Find initiative if specified
    let initiativeId: string | undefined;
    if (initiativeName) {
      const initiatives = await requireClient().initiatives({
        filter: { name: { containsIgnoreCase: initiativeName } }
      });

      if (initiatives.nodes.length === 0) {
        console.error(`[WARNING] Initiative "${initiativeName}" not found, creating unlinked project`);
      } else {
        initiativeId = initiatives.nodes[0].id;
        console.log(`  Linking to initiative: ${initiatives.nodes[0].name}`);
      }
    }

    const result = await requireClient().createProject({
      name,
      teamIds: [team.id],
      ...(initiativeId && { initiativeIds: [initiativeId] })
    });

    const project = await result.project;
    if (project) {
      console.log('\n[SUCCESS] Project created!');
      console.log(`  Name: ${project.name}`);
      console.log(`  ID:   ${project.id}`);
      console.log(`  URL:  ${project.url}`);
    } else {
      console.error('[ERROR] Failed to create project');
      process.exit(1);
    }
  },

  async 'project-status'(projectName: string, state: string) {
    if (!projectName || !state) {
      console.error('Usage: project-status <project-name> <state>');
      console.error('States: backlog, planned, in-progress, paused, completed, canceled');
      console.error('Example: project-status "Phase 8: MCP Decision Engine" completed');
      process.exit(1);
    }

    // Map user-friendly names to API values (Linear UI shows "In Progress" but API uses "started")
    const stateMap: Record<string, string> = {
      'backlog': 'backlog',
      'planned': 'planned',
      'in-progress': 'started',
      'inprogress': 'started',
      'started': 'started',  // Accept legacy value for backwards compatibility
      'paused': 'paused',
      'completed': 'completed',
      'canceled': 'canceled'
    };

    const normalizedInput = state.toLowerCase().replace(/\s+/g, '-');
    const apiState = stateMap[normalizedInput];

    if (!apiState) {
      console.error(`[ERROR] Invalid state: ${state}`);
      console.error('Valid states: backlog, planned, in-progress, paused, completed, canceled');
      process.exit(1);
    }

    const displayState = normalizedInput === 'started' ? 'in-progress' : normalizedInput;
    console.log(`Updating project status: ${projectName} -> ${displayState}...`);

    // Find project by name
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });

    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(1);
    }

    const project = projects.nodes[0];
    console.log(`  Found project: ${project.name}`);
    console.log(`  Current state: ${project.state}`);

    // 'state' is accepted by the GraphQL API but not in the SDK's ProjectUpdateInput type
    await requireClient().updateProject(project.id, { state: apiState } as Record<string, string>);

    console.log(`\n[SUCCESS] Project state updated!`);
    console.log(`  ${project.name}: ${project.state} -> ${displayState}`);
  },

  async 'link-initiative'(projectName: string, initiativeName: string) {
    if (!projectName || !initiativeName) {
      console.error('Usage: link-initiative <project-name> <initiative-name>');
      console.error('Example: link-initiative "Phase 8: MCP Decision Engine" "Q1 Goals"');
      process.exit(1);
    }

    console.log(`Linking project to initiative...`);

    // Find project by name
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });

    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(1);
    }

    const project = projects.nodes[0];
    console.log(`  Found project: ${project.name}`);

    // Find initiative by name
    const initiatives = await requireClient().initiatives({
      filter: { name: { containsIgnoreCase: initiativeName } }
    });

    if (initiatives.nodes.length === 0) {
      console.error(`[ERROR] Initiative "${initiativeName}" not found`);
      process.exit(1);
    }

    const initiative = initiatives.nodes[0];
    console.log(`  Found initiative: ${initiative.name}`);

    // Link project to initiative using createInitiativeToProject
    await requireClient().createInitiativeToProject({
      projectId: project.id,
      initiativeId: initiative.id
    });

    console.log(`\n[SUCCESS] Project linked to initiative!`);
    console.log(`  Project: ${project.name}`);
    console.log(`  Initiative: ${initiative.name}`);
  },

  async 'unlink-initiative'(projectName: string, initiativeName: string) {
    if (!projectName || !initiativeName) {
      console.error('Usage: unlink-initiative <project-name> <initiative-name>');
      console.error('Example: unlink-initiative "Phase 8: MCP Decision Engine" "Linear Skill"');
      process.exit(1);
    }

    console.log(`Unlinking project from initiative...`);

    // Find project by name
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });

    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(1);
    }

    const project = projects.nodes[0];
    console.log(`  Found project: ${project.name}`);

    // Find initiative by name
    const initiatives = await requireClient().initiatives({
      filter: { name: { containsIgnoreCase: initiativeName } }
    });

    if (initiatives.nodes.length === 0) {
      console.error(`[ERROR] Initiative "${initiativeName}" not found`);
      process.exit(1);
    }

    const initiative = initiatives.nodes[0];
    console.log(`  Found initiative: ${initiative.name}`);

    // Fetch all initiative-to-project links and filter client-side
    const allLinks = await requireClient().initiativeToProjects();
    const matchingLinks = allLinks.nodes.filter(
      (l) => l.initiativeId === initiative.id && l.projectId === project.id
    );

    if (matchingLinks.length === 0) {
      console.error(`[ERROR] Project "${project.name}" is not linked to initiative "${initiative.name}"`);
      process.exit(1);
    }

    const link = matchingLinks[0];

    // Delete the initiative-to-project link
    await requireClient().deleteInitiativeToProject(link.id);

    console.log(`\n[SUCCESS] Project unlinked from initiative!`);
    console.log(`  Project: ${project.name}`);
    console.log(`  Initiative: ${initiative.name}`);
  },

  async 'create-project-update'(projectName: string, body: string, healthFlag?: string) {
    if (!projectName || !body) {
      console.error('Usage: create-project-update <project-name> <body> [--health onTrack|atRisk|offTrack]');
      console.error('Example: create-project-update "My Project" "## Summary\\n\\nWork completed..."');
      process.exit(1);
    }

    // Parse health flag
    let health = ProjectUpdateHealthType.OnTrack;
    if (healthFlag === '--health' || healthFlag?.startsWith('--health=')) {
      const value = healthFlag.includes('=') ? healthFlag.split('=')[1] : body;
      if (value === 'atRisk') health = ProjectUpdateHealthType.AtRisk;
      else if (value === 'offTrack') health = ProjectUpdateHealthType.OffTrack;
    }

    console.log(`Creating project update for: ${projectName}...`);

    // Find project by name
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: projectName } }
    });

    if (projects.nodes.length === 0) {
      console.error(`[ERROR] Project "${projectName}" not found`);
      process.exit(1);
    }

    const project = projects.nodes[0];
    console.log(`  Found project: ${project.name}`);

    const result = await requireClient().createProjectUpdate({
      projectId: project.id,
      body,
      health
    });

    const update = await result.projectUpdate;
    if (update) {
      console.log('\n[SUCCESS] Project update created!');
      console.log(`  Health: ${health}`);
      console.log(`  URL:    ${update.url}`);
    } else {
      console.error('[ERROR] Failed to create project update');
      process.exit(1);
    }
  },

  async 'create-initiative-update'(initiativeName: string, body: string, healthFlag?: string) {
    if (!initiativeName || !body) {
      console.error('Usage: create-initiative-update <initiative-name> <body> [--health onTrack|atRisk|offTrack]');
      console.error('Example: create-initiative-update "My Initiative" "## Phase Complete\\n\\n..."');
      process.exit(1);
    }

    // Parse health flag
    let health = InitiativeUpdateHealthType.OnTrack;
    if (healthFlag === '--health' || healthFlag?.startsWith('--health=')) {
      const value = healthFlag.includes('=') ? healthFlag.split('=')[1] : body;
      if (value === 'atRisk') health = InitiativeUpdateHealthType.AtRisk;
      else if (value === 'offTrack') health = InitiativeUpdateHealthType.OffTrack;
    }

    console.log(`Creating initiative update for: ${initiativeName}...`);

    // Find initiative by name
    const initiatives = await requireClient().initiatives({
      filter: { name: { containsIgnoreCase: initiativeName } }
    });

    if (initiatives.nodes.length === 0) {
      console.error(`[ERROR] Initiative "${initiativeName}" not found`);
      process.exit(1);
    }

    const initiative = initiatives.nodes[0];
    console.log(`  Found initiative: ${initiative.name}`);

    const result = await requireClient().createInitiativeUpdate({
      initiativeId: initiative.id,
      body,
      health
    });

    const update = await result.initiativeUpdate;
    if (update) {
      console.log('\n[SUCCESS] Initiative update created!');
      console.log(`  Health: ${health}`);
      console.log(`  URL:    ${update.url}`);
    } else {
      console.error('[ERROR] Failed to create initiative update');
      process.exit(1);
    }
  },

  async 'add-link'(targetName: string, url: string, label: string) {
    if (!targetName || !url || !label) {
      console.error('Usage: add-link <project-or-initiative-name> <url> <label>');
      console.error('Example: add-link "Phase 6A" "https://github.com/..." "Implementation Plan"');
      console.error('\nAdds an external resource link to a project or initiative.');
      process.exit(1);
    }

    console.log(`Adding link to: ${targetName}...`);

    // Try to find as project first
    const projects = await requireClient().projects({
      filter: { name: { containsIgnoreCase: targetName } }
    });

    let entityType: 'project' | 'initiative' = 'project';
    let entityId: string;
    let entityName: string;

    if (projects.nodes.length > 0) {
      entityId = projects.nodes[0].id;
      entityName = projects.nodes[0].name;
      console.log(`  Found project: ${entityName}`);
    } else {
      // Try to find as initiative
      const initiatives = await requireClient().initiatives({
        filter: { name: { containsIgnoreCase: targetName } }
      });

      if (initiatives.nodes.length === 0) {
        console.error(`[ERROR] No project or initiative found matching "${targetName}"`);
        process.exit(1);
      }

      entityType = 'initiative';
      entityId = initiatives.nodes[0].id;
      entityName = initiatives.nodes[0].name;
      console.log(`  Found initiative: ${entityName}`);
    }

    // Use GraphQL directly since SDK doesn't expose entityExternalLinkCreate
    const API_URL = 'https://api.linear.app/graphql';
    const mutation = `
      mutation CreateExternalLink($input: EntityExternalLinkCreateInput!) {
        entityExternalLinkCreate(input: $input) {
          success
          entityExternalLink {
            id
            label
            url
          }
        }
      }
    `;

    const input: Record<string, string> = { url, label };
    if (entityType === 'project') {
      input.projectId = entityId;
    } else {
      input.initiativeId = entityId;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': requireApiKey()
      },
      body: JSON.stringify({
        query: mutation,
        variables: { input }
      })
    });

    const data = await response.json();

    if (data.errors) {
      console.error('[ERROR] GraphQL errors:', JSON.stringify(data.errors, null, 2));
      process.exit(1);
    }

    if (data.data.entityExternalLinkCreate.success) {
      const link = data.data.entityExternalLinkCreate.entityExternalLink;
      console.log('\n[SUCCESS] External link added!');
      console.log(`  ID:    ${link.id}`);
      console.log(`  Label: ${link.label}`);
      console.log(`  URL:   ${link.url}`);
      console.log(`  Added to ${entityType}: ${entityName}`);
    } else {
      console.error('[ERROR] Failed to create external link');
      process.exit(1);
    }
  },

  async 'status'(state: string, ...issueNumbers: string[]) {
    if (!state || issueNumbers.length === 0) {
      console.error('Usage: status <state> <issue-numbers...>');
      console.error('Example: status Done 123 124 125');
      console.error('Example: status Done ENG-123 ENG-124  (prefix is stripped automatically)');
      console.error('\nAvailable states: Backlog, Todo, In Progress, In Review, Done, Canceled');
      process.exit(1);
    }

    // Normalize state name
    const stateMap: Record<string, string> = {
      'backlog': 'Backlog',
      'todo': 'Todo',
      'in progress': 'In Progress',
      'inprogress': 'In Progress',
      'in review': 'In Review',
      'inreview': 'In Review',
      'done': 'Done',
      'canceled': 'Canceled',
      'cancelled': 'Canceled'
    };

    const normalizedState = stateMap[state.toLowerCase()] || state;

    console.log(`Updating ${issueNumbers.length} issue(s) to "${normalizedState}"...\n`);

    // Get workflow states to find the state ID
    const states = await requireClient().workflowStates({
      filter: { name: { eq: normalizedState } }
    });

    if (states.nodes.length === 0) {
      console.error(`[ERROR] State "${normalizedState}" not found`);
      console.error('Available states: Backlog, Todo, In Progress, In Review, Done, Canceled');
      process.exit(1);
    }

    const stateId = states.nodes[0].id;

    // Process each issue
    let success = 0;
    let failed = 0;
    const linAvailable = await isLinCliAvailable();

    for (const num of issueNumbers) {
      // Strip prefix if present (e.g., "ENG-123" -> "123", "ENG-456" -> "456")
      const cleanedNum = num.replace(/^[A-Z]+-/i, '');
      const issueNum = parseInt(cleanedNum, 10);
      if (isNaN(issueNum)) {
        console.log(`  [SKIP] "${num}" is not a valid issue number`);
        failed++;
        continue;
      }

      // Try lin fast-path (requires full identifier e.g. "SMI-123")
      if (linAvailable && num.includes('-')) {
        const linResult = await linUpdateIssueState(num, normalizedState);
        if (linResult.success) {
          console.log(`  [OK] ${num} -> ${normalizedState}`);
          success++;
          continue;
        }
        // Silent fallback to SDK
      }

      try {
        // Find issue by number (SDK path)
        const issues = await requireClient().issues({
          filter: { number: { eq: issueNum } }
        });

        if (issues.nodes.length === 0) {
          console.log(`  [NOT FOUND] Issue #${issueNum}`);
          failed++;
          continue;
        }

        const issue = issues.nodes[0];
        await issue.update({ stateId });
        console.log(`  [OK] ${issue.identifier} -> ${normalizedState}`);
        success++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  [ERROR] Issue #${issueNum}: ${msg}`);
        failed++;
      }
    }

    console.log(`\nResult: ${success} updated, ${failed} failed`);
    if (failed > 0) process.exit(1);
  },

  async 'list-initiatives'() {
    console.log('Fetching initiatives...\n');

    const sdkListInitiatives = async () => {
      const initiatives = await requireClient().initiatives({ first: 50 });

      if (initiatives.nodes.length === 0) {
        console.log('No initiatives found.');
        return;
      }

      console.log('Initiatives:');
      for (const init of initiatives.nodes) {
        const status = init.status || 'No status';
        console.log(`  - ${init.name}`);
        console.log(`    ID: ${init.id}`);
        console.log(`    Status: ${status}`);
        console.log(`    URL: ${init.url}`);
        console.log('');
      }
    };

    await tryLin(['initiatives', 'list'], sdkListInitiatives, (data: unknown) => {
      const initiatives = Array.isArray(data) ? data : [];
      if (initiatives.length === 0) {
        console.log('No initiatives found.');
        return;
      }

      console.log('Initiatives:');
      for (const init of initiatives) {
        const i = init as Record<string, unknown>;
        console.log(`  - ${i.name}`);
        console.log(`    ID: ${i.id}`);
        console.log(`    Status: ${i.status || 'No status'}`);
        console.log(`    URL: ${i.url || ''}`);
        console.log('');
      }
    });
  },

  async 'list-projects'(initiativeName?: string) {
    console.log('Fetching projects...\n');

    let filter = {};
    if (initiativeName) {
      // Find initiative first
      const initiatives = await requireClient().initiatives({
        filter: { name: { containsIgnoreCase: initiativeName } }
      });

      if (initiatives.nodes.length === 0) {
        console.error(`[ERROR] Initiative "${initiativeName}" not found`);
        process.exit(1);
      }

      console.log(`Filtering by initiative: ${initiatives.nodes[0].name}\n`);
      filter = { initiatives: { id: { eq: initiatives.nodes[0].id } } };
    }

    const projects = await requireClient().projects({ first: 50, filter });

    if (projects.nodes.length === 0) {
      console.log('No projects found.');
      return;
    }

    console.log('Projects:');
    for (const proj of projects.nodes) {
      const status = await proj.status;
      console.log(`  - ${proj.name}`);
      console.log(`    ID: ${proj.id}`);
      console.log(`    Status: ${status?.name || 'No status'}`);
      console.log(`    URL: ${proj.url}`);
      console.log('');
    }
  },

  async 'setup'() {
    // Delegate to setup script — detect if running from dist/ or source
    const { execSync } = await import('child_process');
    const { dirname } = await import('path');
    const { fileURLToPath } = await import('url');

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const isBundled = typeof __BUNDLED__ !== 'undefined';
    const runner = isBundled ? 'node' : 'npx tsx';
    const ext = isBundled ? '.js' : '.ts';
    execSync(`${runner} ${__dirname}/setup${ext}`, { stdio: 'inherit' });
  },

  async 'whoami'() {
    console.log('Fetching user info...\n');

    // SDK fallback
    const sdkWhoami = async () => {
      const me = await requireClient().viewer;
      const org = await me.organization;
      const teams = await me.teams();

      console.log('Current User:');
      console.log(`  Name:  ${me.name}`);
      console.log(`  Email: ${me.email}`);
      console.log(`  ID:    ${me.id}`);
      console.log('');
      console.log('Organization:');
      console.log(`  Name: ${org?.name || 'Unknown'}`);
      console.log(`  ID:   ${org?.id || 'Unknown'}`);
      console.log('');
      console.log('Teams:');
      for (const team of teams.nodes) {
        console.log(`  - ${team.name} (${team.key})`);
      }
    };

    await tryLin(['me'], sdkWhoami, (data: unknown) => {
      // Format lin JSON output to match existing display
      const user = data as Record<string, unknown>;
      console.log('Current User:');
      console.log(`  Name:  ${user.name || 'Unknown'}`);
      console.log(`  Email: ${user.email || 'Unknown'}`);
      console.log(`  ID:    ${user.id || 'Unknown'}`);
      console.log('');
      if (user.organization && typeof user.organization === 'object') {
        const org = user.organization as Record<string, unknown>;
        console.log('Organization:');
        console.log(`  Name: ${org.name || 'Unknown'}`);
        console.log(`  ID:   ${org.id || 'Unknown'}`);
        console.log('');
      }
      if (Array.isArray(user.teams)) {
        console.log('Teams:');
        for (const team of user.teams) {
          const t = team as Record<string, unknown>;
          console.log(`  - ${t.name} (${t.key})`);
        }
      }
    });
  },

  // Update issue fields (title, description)
  async 'update-issue'(issueIdentifier: string, field: string, ...valueParts: string[]) {
    if (!issueIdentifier || !field || valueParts.length === 0) {
      usageUpdateIssue();
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }

    if (field !== 'title' && field !== 'description') {
      console.error(`[ERROR] Unknown field: ${field}. Supported: title, description`);
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }

    const updateField = field as UpdateIssueField;
    const { value, force, strictFlag } = await parseUpdateIssueValue(updateField, valueParts);

    if (updateField === 'description') {
      const descResult = validateIssueDescription(value);
      if (!descResult.valid || descResult.warnings.length > 0) {
        const strict = isStrictMode(strictFlag);
        const output = formatDescriptionValidationResult(descResult);
        if (!descResult.valid && strict) {
          console.error(output);
          process.exit(EXIT_CODES.VALIDATION_ERROR);
        } else if (!descResult.valid) {
          console.warn('[WARN] Description validation downgraded (strict mode off):');
          console.warn(output);
        } else if (descResult.warnings.length > 0) {
          console.warn(formatWarningsOnly(descResult));
        }
      }
    }

    if (!force && !process.stdin.isTTY) {
      console.error('[ERROR] update-issue replaces existing content and requires --force in non-interactive mode');
      console.error('Run from a terminal for an interactive confirmation, or pass --force for scripts.');
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }

    const client = requireClient();
    const issue = await resolveIssueForUpdate(client, issueIdentifier);
    const updateInput: Parameters<Issue['update']>[0] =
      updateField === 'title' ? { title: value } : { description: value };

    if (!force) {
      await confirmIssueUpdate(issue, updateField, value);
    }

    console.log(`Updating ${issue.identifier} - ${issue.title}...`);
    await issue.update(updateInput);

    console.log('\n[SUCCESS] Issue updated!');
    console.log(`  ${issue.identifier}: ${field} updated`);
    console.log(`  New ${field}: ${previewText(value, 160)}`);
    console.log(`  URL: ${issue.url}`);
  },

  // Alias: done <issue-numbers...> -> status Done <issue-numbers...>
  async 'done'(...issueNumbers: string[]) {
    if (issueNumbers.length === 0) {
      console.error('Usage: done <issue-numbers...>');
      console.error('Example: done 123 124 125');
      console.error('Example: done ENG-123 ENG-124  (prefix is stripped automatically)');
      console.error('\nThis is a shortcut for: status Done <issue-numbers...>');
      process.exit(1);
    }
    await commands['status']('Done', ...issueNumbers);
  },

  // Alias: wip <issue-numbers...> -> status "In Progress" <issue-numbers...>
  async 'wip'(...issueNumbers: string[]) {
    if (issueNumbers.length === 0) {
      console.error('Usage: wip <issue-numbers...>');
      console.error('Example: wip 123 124 125');
      console.error('Example: wip ENG-123 ENG-124  (prefix is stripped automatically)');
      console.error('\nThis is a shortcut for: status "In Progress" <issue-numbers...>');
      process.exit(1);
    }
    await commands['status']('In Progress', ...issueNumbers);
  },

  // Set parent-child relationship between issues
  async 'set-parent'(parentIssue: string, ...childIssues: string[]) {
    if (!parentIssue || childIssues.length === 0) {
      console.error('Usage: set-parent <parent-issue> <child-issues...>');
      console.error('Example: set-parent ENG-100 ENG-101 ENG-102');
      console.error('Example: set-parent 100 101 102  (prefix optional)');
      console.error('\nSets the first issue as parent of all subsequent issues (sub-issues).');
      process.exit(1);
    }

    // Parse parent issue number
    const parentNum = parseInt(parentIssue.replace(/^[A-Z]+-/i, ''), 10);
    if (isNaN(parentNum)) {
      console.error(`[ERROR] "${parentIssue}" is not a valid issue number`);
      process.exit(1);
    }

    console.log(`Setting parent-child relationships...`);

    // Find parent issue
    const parentIssues = await requireClient().issues({
      filter: { number: { eq: parentNum } }
    });

    if (parentIssues.nodes.length === 0) {
      console.error(`[ERROR] Parent issue #${parentNum} not found`);
      process.exit(1);
    }

    const parent = parentIssues.nodes[0];
    console.log(`  Parent: ${parent.identifier} - ${parent.title}`);

    // Process each child issue
    let success = 0;
    let failed = 0;

    for (const childIssue of childIssues) {
      const childNum = parseInt(childIssue.replace(/^[A-Z]+-/i, ''), 10);
      if (isNaN(childNum)) {
        console.log(`  [SKIP] "${childIssue}" is not a valid issue number`);
        failed++;
        continue;
      }

      try {
        const childIssues = await requireClient().issues({
          filter: { number: { eq: childNum } }
        });

        if (childIssues.nodes.length === 0) {
          console.log(`  [NOT FOUND] Issue #${childNum}`);
          failed++;
          continue;
        }

        const child = childIssues.nodes[0];
        await child.update({ parentId: parent.id });
        console.log(`  [OK] ${child.identifier} -> child of ${parent.identifier}`);
        success++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`  [ERROR] Issue #${childNum}: ${msg}`);
        failed++;
      }
    }

    console.log(`\nResult: ${success} linked as sub-issues, ${failed} failed`);
    if (failed > 0) process.exit(1);
  },

  // Create a new issue as a sub-issue (child) of another issue
  async 'create-sub-issue'(parentIssue: string, title: string, description?: string, ...flags: string[]) {
    // --template short-circuit
    const allArgs = [parentIssue, title, description, ...flags].filter((a): a is string => typeof a === 'string');
    if (allArgs.includes('--template')) {
      process.stdout.write(buildIssueTemplate(title && title !== '--template' ? title : undefined));
      return;
    }

    if (!parentIssue || !title) {
      console.error('Usage: create-sub-issue <parent-issue> <title> [description] [--priority 1-4] [--labels label1,label2] [--strict=false]');
      console.error('Example: create-sub-issue ENG-100 "Implement feature" "Detailed description..."');
      console.error('Example: create-sub-issue 100 "Add tests" --priority 2');
      console.error('\nPrint template: create-sub-issue --template');
      process.exit(1);
    }

    // Parse parent issue number
    const parentNum = parseInt(parentIssue.replace(/^[A-Z]+-/i, ''), 10);
    if (isNaN(parentNum)) {
      console.error(`[ERROR] "${parentIssue}" is not a valid issue number`);
      process.exit(1);
    }

    // Parse flags
    let priority = 3;
    let labelNames: string[] = [];
    let strictFlag: boolean | undefined;

    for (let i = 0; i < flags.length; i++) {
      if (flags[i] === '--priority' && flags[i + 1]) {
        priority = parseInt(flags[i + 1], 10);
        i++;
      } else if (flags[i] === '--labels' && flags[i + 1]) {
        labelNames = flags[i + 1].split(',').map(l => l.trim());
        i++;
      } else if (flags[i] === '--strict=false') {
        strictFlag = false;
      } else if (flags[i] === '--strict=true') {
        strictFlag = true;
      }
    }

    // Validate description BEFORE any API work (before tryLin too).
    const descResult = validateIssueDescription(description ?? '');
    if (!descResult.valid || descResult.warnings.length > 0) {
      const strict = isStrictMode(strictFlag);
      const output = formatDescriptionValidationResult(descResult);
      if (!descResult.valid && strict) {
        console.error(output);
        process.exit(EXIT_CODES.VALIDATION_ERROR);
      } else if (!descResult.valid) {
        console.warn('[WARN] Description validation downgraded (strict mode off):');
        console.warn(output);
      } else if (descResult.warnings.length > 0) {
        console.warn(formatWarningsOnly(descResult));
      }
    }

    console.log(`Creating sub-issue for parent #${parentNum}...`);

    // Find parent issue
    const parentIssues = await requireClient().issues({
      filter: { number: { eq: parentNum } }
    });

    if (parentIssues.nodes.length === 0) {
      console.error(`[ERROR] Parent issue #${parentNum} not found`);
      process.exit(1);
    }

    const parent = parentIssues.nodes[0];
    const parentTeam = await parent.team;
    const parentProject = await parent.project;

    console.log(`  Parent: ${parent.identifier} - ${parent.title}`);
    console.log(`  Team: ${parentTeam?.name || 'Unknown'}`);
    if (parentProject) {
      console.log(`  Project: ${parentProject.name}`);
    }

    if (!parentTeam) {
      console.error('[ERROR] Could not determine team from parent issue');
      process.exit(1);
    }

    // Resolve label names to IDs if provided
    const labelIds: string[] = [];
    if (labelNames.length > 0) {
      const labels = await parentTeam.labels();
      for (const name of labelNames) {
        const label = labels.nodes.find(l =>
          l.name.toLowerCase() === name.toLowerCase()
        );
        if (label) {
          labelIds.push(label.id);
          console.log(`  Found label: ${label.name}`);
        } else {
          console.log(`  [WARNING] Label "${name}" not found, skipping`);
        }
      }
    }

    // Create issue with parent
    const result = await requireClient().createIssue({
      teamId: parentTeam.id,
      parentId: parent.id,
      title,
      description: description || '',
      priority,
      ...(parentProject && { projectId: parentProject.id }),
      ...(labelIds.length > 0 && { labelIds })
    });

    const issue = await result.issue;
    if (issue) {
      console.log('\n[SUCCESS] Sub-issue created!');
      console.log(`  ID:       ${issue.identifier}`);
      console.log(`  Title:    ${issue.title}`);
      console.log(`  Priority: ${priority}`);
      console.log(`  Parent:   ${parent.identifier}`);
      console.log(`  URL:      ${issue.url}`);
    } else {
      console.error('[ERROR] Failed to create sub-issue');
      process.exit(1);
    }
  },

  // List sub-issues (children) of a parent issue
  async 'list-sub-issues'(parentIssue: string) {
    if (!parentIssue) {
      console.error('Usage: list-sub-issues <parent-issue>');
      console.error('Example: list-sub-issues ENG-100');
      console.error('Example: list-sub-issues 100');
      console.error('\nLists all sub-issues (children) of the specified parent issue.');
      process.exit(1);
    }

    // Parse parent issue number
    const parentNum = parseInt(parentIssue.replace(/^[A-Z]+-/i, ''), 10);
    if (isNaN(parentNum)) {
      console.error(`[ERROR] "${parentIssue}" is not a valid issue number`);
      process.exit(1);
    }

    console.log(`Fetching sub-issues for #${parentNum}...\n`);

    // Find parent issue
    const parentIssues = await requireClient().issues({
      filter: { number: { eq: parentNum } }
    });

    if (parentIssues.nodes.length === 0) {
      console.error(`[ERROR] Issue #${parentNum} not found`);
      process.exit(1);
    }

    const parent = parentIssues.nodes[0];
    console.log(`Parent: ${parent.identifier} - ${parent.title}\n`);

    // Get children of this issue
    const children = await parent.children();

    if (children.nodes.length === 0) {
      console.log('No sub-issues found.');
      return;
    }

    console.log(`Sub-issues (${children.nodes.length}):`);
    for (const child of children.nodes) {
      const state = await child.state;
      console.log(`  - ${child.identifier}: ${child.title}`);
      console.log(`    Status: ${state?.name || 'Unknown'}`);
      console.log(`    URL: ${child.url}`);
      console.log('');
    }
  },

  // ==================== DESCRIPTION VALIDATION ====================

  // Pre-flight validator for MCP save_issue callers (and anyone else).
  // Runs without LINEAR_API_KEY — pure-logic reuse of validateIssueDescription.
  async 'validate-description'(...args: string[]) {
    let body: string | undefined;
    let filePath: string | undefined;
    let readStdin = false;
    let strictFlag: boolean | undefined;

    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--file' && args[i + 1]) {
        filePath = args[i + 1];
        i++;
      } else if (a === '--stdin') {
        readStdin = true;
      } else if (a === '--strict=false') {
        strictFlag = false;
      } else if (a === '--strict=true') {
        strictFlag = true;
      } else if (!a.startsWith('--') && body === undefined) {
        body = a;
      }
    }

    if (readStdin) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
      body = Buffer.concat(chunks).toString('utf8');
    } else if (filePath !== undefined) {
      const { readFileSync } = await import('node:fs');
      try {
        body = readFileSync(filePath, 'utf8');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ERROR] Cannot read file "${filePath}": ${msg}`);
        process.exit(EXIT_CODES.INVALID_ARGUMENTS);
      }
    }

    if (body === undefined) {
      console.error('Usage: validate-description <body>');
      console.error('       validate-description --file <path>');
      console.error('       validate-description --stdin');
      console.error('');
      console.error('Validate an issue description against the Acceptance Criteria contract.');
      console.error('Exit 0 = valid, 5 = invalid + strict, 2 = bad args.');
      console.error('Use --strict=false to downgrade failures to warnings (exit 0).');
      process.exit(EXIT_CODES.INVALID_ARGUMENTS);
    }

    const result = validateIssueDescription(body);
    const strict = isStrictMode(strictFlag);

    if (!result.valid && strict) {
      console.error(formatDescriptionValidationResult(result));
      process.exit(EXIT_CODES.VALIDATION_ERROR);
    } else if (!result.valid) {
      console.warn('[WARN] Description validation downgraded (strict mode off):');
      console.warn(formatDescriptionValidationResult(result));
      // Exit 0 — caller asked to downgrade.
      return;
    } else if (result.warnings.length > 0) {
      console.warn(formatWarningsOnly(result));
    }

    console.log('✓ Issue description is valid.');
  },

  // ==================== LABEL TAXONOMY COMMANDS ====================

  async 'labels'(subcommand: string, ...args: string[]) {
    if (!subcommand) {
      console.error('Usage: labels <subcommand> [args]');
      console.error('Subcommands:');
      console.error('  taxonomy              Show full label taxonomy');
      console.error('  validate <labels>     Validate a comma-separated list of labels');
      console.error('  suggest <title>       Suggest labels based on issue title');
      console.error('  agents <labels>       Show agent recommendations for labels');
      console.error('  set <issue> <labels>  Set labels on an existing issue');
      process.exit(1);
    }

    switch (subcommand) {
      case 'taxonomy':
        await commands['labels-taxonomy']();
        break;
      case 'validate':
        await commands['labels-validate'](args.join(','));
        break;
      case 'suggest':
        await commands['labels-suggest'](args.join(' '));
        break;
      case 'agents':
        await commands['labels-agents'](args.join(','));
        break;
      case 'set':
        await commands['labels-set'](...args);
        break;
      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        console.error('Run "labels" without arguments for usage.');
        process.exit(1);
    }
  },

  async 'labels-taxonomy'() {
    console.log('=== Label Taxonomy ===\n');

    console.log('TYPE LABELS (exactly one required per issue):');
    console.log('----------------------------------------------');
    for (const label of getLabelsByCategory('type')) {
      console.log(`  ${label.name.padEnd(15)} ${label.color}  ${label.description}`);
    }

    console.log('\nDOMAIN LABELS (1-2 recommended per issue):');
    console.log('----------------------------------------------');
    for (const label of getLabelsByCategory('domain')) {
      const agents = label.primaryAgents?.join(', ') || 'none';
      console.log(`  ${label.name.padEnd(15)} ${label.color}  ${label.description}`);
      console.log(`                    Primary agents: ${agents}`);
    }

    console.log('\nSCOPE LABELS (0-2 optional per issue):');
    console.log('----------------------------------------------');
    for (const label of getLabelsByCategory('scope')) {
      console.log(`  ${label.name.padEnd(15)} ${label.color}  ${label.description}`);
    }

    console.log('\n=== Summary ===');
    console.log(`Total labels: ${getAllLabels().length}`);
    console.log(`  Type labels:   ${getLabelsByCategory('type').length}`);
    console.log(`  Domain labels: ${getLabelsByCategory('domain').length}`);
    console.log(`  Scope labels:  ${getLabelsByCategory('scope').length}`);
  },

  async 'labels-validate'(labelString: string) {
    if (!labelString) {
      console.error('Usage: labels validate <labels>');
      console.error('Example: labels validate "feature,security,breaking-change"');
      process.exit(1);
    }

    const labels = labelString.split(',').map(l => l.trim()).filter(l => l);
    console.log(`Validating labels: ${labels.join(', ')}\n`);

    const result = validateLabels(labels);
    console.log(formatValidationResult(result));

    if (!result.valid) {
      process.exit(1);
    }
  },

  async 'labels-suggest'(title: string) {
    if (!title) {
      console.error('Usage: labels suggest <title>');
      console.error('Example: labels suggest "Fix XSS vulnerability in login form"');
      process.exit(1);
    }

    console.log(`Analyzing: "${title}"\n`);

    const suggestions = suggestLabels(title);
    console.log(formatSuggestions(suggestions));

    if (suggestions.length > 0) {
      const suggestedLabels = suggestions.map(s => s.label);
      console.log(`\nSuggested label set: ${suggestedLabels.join(', ')}`);
    }
  },

  async 'labels-agents'(labelString: string) {
    if (!labelString) {
      console.error('Usage: labels agents <labels>');
      console.error('Example: labels agents "security,performance"');
      process.exit(1);
    }

    const labels = labelString.split(',').map(l => l.trim()).filter(l => l);
    console.log(`Finding agents for labels: ${labels.join(', ')}\n`);

    const selection = selectAgentsForIssue(labels);
    console.log(formatAgentSelection(selection));
  },

  async 'labels-matrix'() {
    console.log('=== Agent-Domain Matrix ===\n');
    console.log(formatAgentMatrix());
  },

  async 'labels-set'(issueIdentifier: string, labelString: string, ...flags: string[]) {
    if (!issueIdentifier || !labelString) {
      console.error('Usage: labels set <issue-id> <labels> [--replace]');
      console.error('Example: labels set SMI-1770 mcp,DX,feature');
      console.error('Example: labels set ENG-123 bug,security --replace');
      console.error('\nOptions:');
      console.error('  --replace    Replace all existing labels (default: add to existing)');
      console.error('\nLabels are validated against the taxonomy before applying.');
      process.exit(1);
    }

    // Parse flags
    const replaceMode = flags.includes('--replace');

    // Parse label names
    const labelNames = labelString.split(',').map(l => l.trim()).filter(l => l);
    if (labelNames.length === 0) {
      console.error('[ERROR] No valid labels provided');
      process.exit(1);
    }

    console.log(`Setting labels on issue: ${issueIdentifier}...`);
    console.log(`  Labels: ${labelNames.join(', ')}`);
    console.log(`  Mode: ${replaceMode ? 'replace all' : 'add to existing'}`);

    // Validate labels against taxonomy
    const validation = validateLabels(labelNames);
    if (validation.warnings.length > 0) {
      for (const warn of validation.warnings) {
        console.log(`  [WARNING] ${warn}`);
      }
    }
    if (validation.parsed.unknown.length > 0) {
      console.log(`  [WARNING] Labels not in taxonomy: ${validation.parsed.unknown.join(', ')}`);
    }

    // Parse issue identifier (e.g., "SMI-1770" -> 1770, or just "1770")
    const issueNum = parseInt(issueIdentifier.replace(/^[A-Z]+-/i, ''), 10);
    if (isNaN(issueNum)) {
      console.error(`[ERROR] "${issueIdentifier}" is not a valid issue identifier`);
      process.exit(1);
    }

    // Find issue by number
    const issues = await requireClient().issues({
      filter: { number: { eq: issueNum } }
    });

    if (issues.nodes.length === 0) {
      console.error(`[ERROR] Issue #${issueNum} not found`);
      process.exit(1);
    }

    const issue = issues.nodes[0];
    console.log(`  Found: ${issue.identifier} - ${issue.title}`);

    // Get team for label resolution
    const team = await issue.team;
    if (!team) {
      console.error('[ERROR] Could not determine team from issue');
      process.exit(1);
    }

    // Build label map from workspace labels (case-insensitive lookup)
    // Fetch with higher limit to ensure we get all labels
    const workspaceLabels = await requireClient().issueLabels({ first: 250 });
    const labelMap = new Map<string, { id: string; name: string }>();
    for (const label of workspaceLabels.nodes) {
      labelMap.set(label.name.toLowerCase(), { id: label.id, name: label.name });
    }

    // Resolve label names to IDs
    const resolvedLabels: { id: string; name: string }[] = [];
    const notFound: string[] = [];

    for (const name of labelNames) {
      const found = labelMap.get(name.toLowerCase());
      if (found) {
        resolvedLabels.push(found);
      } else {
        notFound.push(name);
      }
    }

    if (notFound.length > 0) {
      console.log(`  [WARNING] Labels not found in workspace: ${notFound.join(', ')}`);
    }

    if (resolvedLabels.length === 0) {
      console.error('[ERROR] No valid labels could be resolved');
      process.exit(1);
    }

    // Get existing labels
    const existingLabels = await issue.labels();
    const existingNames = existingLabels.nodes.map(l => l.name);

    let finalLabelIds: string[];
    if (replaceMode) {
      // Replace mode: use only the new labels
      finalLabelIds = resolvedLabels.map(l => l.id);
    } else {
      // Add mode: merge with existing labels
      const existingIds = existingLabels.nodes.map(l => l.id);
      const newIds = resolvedLabels
        .filter(l => !existingIds.includes(l.id))
        .map(l => l.id);
      finalLabelIds = [...existingIds, ...newIds];
    }

    // Update issue
    await issue.update({ labelIds: finalLabelIds });

    // Verify the update
    const updatedIssue = await requireClient().issue(issue.id);
    const updatedLabels = await updatedIssue.labels();
    const updatedNames = updatedLabels.nodes.map(l => l.name);

    console.log('\n[SUCCESS] Labels updated!');
    console.log(`  Issue: ${issue.identifier}`);
    if (!replaceMode && existingNames.length > 0) {
      console.log(`  Previous: ${existingNames.join(', ')}`);
    }
    console.log(`  Current:  ${updatedNames.join(', ')}`);
    console.log(`  URL:      ${issue.url}`);
  },

  async 'search'(query: string) {
    if (!query) {
      console.error('Usage: search <query>');
      console.error('Example: search "fix login bug"');
      process.exit(1);
    }

    console.log(`Searching for "${query}"...\n`);

    const sdkSearch = async () => {
      const client = requireClient();
      const results = await (client as unknown as { issueSearch: (opts: { query: string; first: number }) => Promise<{ nodes: Array<{ identifier: string; title: string; state: Promise<{ name: string }> }> }> }).issueSearch({ query, first: 25 });

      if (!results || results.nodes.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log(`Found ${results.nodes.length} issue(s):\n`);
      for (const issue of results.nodes) {
        const state = await issue.state;
        console.log(`  ${issue.identifier}  ${issue.title}`);
        console.log(`    State: ${state?.name || 'Unknown'}`);
      }
    };

    await tryLin(['search', query], sdkSearch, (data: unknown) => {
      const issues = Array.isArray(data) ? data : [];
      if (issues.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log(`Found ${issues.length} issue(s):\n`);
      for (const issue of issues) {
        const i = issue as Record<string, unknown>;
        console.log(`  ${i.identifier || i.id}  ${i.title}`);
        if (i.state) console.log(`    State: ${typeof i.state === 'object' ? (i.state as Record<string, unknown>).name : i.state}`);
      }
    });
  },

  async 'list-issues'(...args: string[]) {
    // Parse flags: --team X --state Y
    let team: string | undefined;
    let state: string | undefined;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--team' && args[i + 1]) {
        team = args[++i];
      } else if (args[i] === '--state' && args[i + 1]) {
        state = args[++i];
      }
    }

    console.log('Fetching issues...\n');

    const sdkListIssues = async () => {
      const client = requireClient();
      const filter: Record<string, unknown> = {};
      if (team) filter.team = { key: { eq: team } };
      if (state) filter.state = { name: { eq: state } };

      const results = await client.issues({
        first: 50,
        ...(Object.keys(filter).length > 0 && { filter })
      });

      if (results.nodes.length === 0) {
        console.log('No issues found.');
        return;
      }

      console.log(`Found ${results.nodes.length} issue(s):\n`);
      for (const issue of results.nodes) {
        const issueState = await issue.state;
        console.log(`  ${issue.identifier}  ${issue.title}`);
        console.log(`    State: ${issueState?.name || 'Unknown'}  Priority: ${issue.priority || 0}`);
      }
    };

    const linArgs = ['issues', 'list'];
    if (team) linArgs.push('--team', team);
    if (state) linArgs.push('--state', state);

    await tryLin(linArgs, sdkListIssues, (data: unknown) => {
      const issues = Array.isArray(data) ? data : [];
      if (issues.length === 0) {
        console.log('No issues found.');
        return;
      }

      console.log(`Found ${issues.length} issue(s):\n`);
      for (const issue of issues) {
        const i = issue as Record<string, unknown>;
        console.log(`  ${i.identifier || i.id}  ${i.title}`);
        const s = typeof i.state === 'object' ? (i.state as Record<string, unknown>).name : i.state;
        console.log(`    State: ${s || 'Unknown'}  Priority: ${i.priority || 0}`);
      }
    });
  },

  async 'help'() {
    console.log(`
Linear High-Level Operations

Usage:
  npx tsx linear-ops.ts <command> [arguments]

Commands:
  create-issue <project-name> <title> [description] [--priority 1-4] [--labels label1,label2]
    Create a new issue in a project
    Priority: 1=urgent, 2=high, 3=medium, 4=low (default: 3)

  create-sub-issue <parent-issue> <title> [description] [--priority 1-4] [--labels label1,label2]
    Create a new issue as a child of an existing issue
    Inherits team and project from parent issue
    Example: create-sub-issue ENG-100 "Add unit tests"

  update-issue <issue-id> <title|description> <value> [--force] [--strict=false]
    Update an issue title or description by full identifier, e.g. ENG-123
    Bare numbers work only when a single issue matches that number
    Description updates use the same Acceptance Criteria validator as create-issue
    Examples:
      update-issue ENG-123 title "Corrected title" --force
      update-issue ENG-123 description --file /tmp/description.md --force
      cat /tmp/description.md | update-issue ENG-123 description --stdin --force

  set-parent <parent-issue> <child-issues...>
    Set parent-child relationships between existing issues
    Useful for organizing issues into hierarchies
    Example: set-parent ENG-100 ENG-101 ENG-102

  list-sub-issues <parent-issue>
    List all sub-issues (children) of a parent issue
    Example: list-sub-issues ENG-100

  create-initiative <name> [description]
    Create a new initiative

  create-project <name> [initiative-name]
    Create a project, optionally linked to an initiative

  project-status <project-name> <state>
    Update project state
    States: backlog, planned, in-progress, paused, completed, canceled

  link-initiative <project-name> <initiative-name>
    Link an existing project to an initiative

  unlink-initiative <project-name> <initiative-name>
    Remove a project from an initiative

  create-project-update <project-name> <body> [--health onTrack|atRisk|offTrack]
    Create a project update with markdown body

  create-initiative-update <initiative-name> <body> [--health onTrack|atRisk|offTrack]
    Create an initiative update with markdown body

  add-link <project-or-initiative-name> <url> <label>
    Add an external resource link to a project or initiative
    Automatically detects whether the target is a project or initiative

  status <state> <issue-numbers...>
    Update issue status (e.g., status Done 123 124 125)
    Accepts both formats: 123 or ENG-123 (prefix stripped automatically)
    States: Backlog, Todo, In Progress, In Review, Done, Canceled

  done <issue-numbers...>
    Shortcut for: status Done <issue-numbers...>
    Example: done ENG-123 ENG-124

  wip <issue-numbers...>
    Shortcut for: status "In Progress" <issue-numbers...>
    Example: wip ENG-123

  list-initiatives
    List all initiatives in the workspace

  list-projects [initiative-name]
    List projects, optionally filtered by initiative

  whoami
    Show current user and organization

  search <query>
    Search issues across workspace
    Example: search "fix login bug"

  list-issues [--team X] [--state Y]
    List issues with optional filters
    Example: list-issues --team SMI --state "In Progress"

  setup
    Check Linear skill setup and configuration

  labels <subcommand> [args]
    Label taxonomy commands:
    - labels taxonomy           Show full label taxonomy
    - labels validate <labels>  Validate comma-separated labels
    - labels suggest <title>    Suggest labels for issue title
    - labels agents <labels>    Show agent recommendations
    - labels set <issue> <labels> [--replace]  Set labels on existing issue

  validate-description <body>
  validate-description --file <path>
  validate-description --stdin
    Validate an issue description against the Acceptance Criteria contract
    (no API calls, no LINEAR_API_KEY required). Pre-flight gate for MCP
    save_issue callers.
    Exit 0 = valid, 5 = invalid + strict, 2 = bad args.
    Use --strict=false to downgrade failures to warnings (exit 0).
    Example: echo "$DRAFT" | npm run ops -- validate-description --stdin

  help
    Show this help message

Examples:
  npx tsx linear-ops.ts create-issue "My Project" "Fix login bug" "Users cannot log in" --priority 2
  npx tsx linear-ops.ts create-sub-issue ENG-100 "Add unit tests" "Unit tests for new feature" --priority 2
  npx tsx linear-ops.ts set-parent ENG-100 ENG-101 ENG-102
  npx tsx linear-ops.ts list-sub-issues ENG-100
  npx tsx linear-ops.ts create-initiative "Q1 2025 Goals" "Key initiatives for Q1"
  npx tsx linear-ops.ts create-project "Phase 1: Foundation" "Q1 2025 Goals"
  npx tsx linear-ops.ts create-project-update "My Project" "## Summary\\n\\nWork completed"
  npx tsx linear-ops.ts create-initiative-update "My Initiative" "## Phase Complete"
  npx tsx linear-ops.ts add-link "Phase 6A" "https://github.com/org/repo/docs/plan.md" "Implementation Plan"
  npx tsx linear-ops.ts status Done 123 124 125
  npx tsx linear-ops.ts done ENG-123 ENG-124
  npx tsx linear-ops.ts wip ENG-125
  npx tsx linear-ops.ts update-issue ENG-123 title "Corrected title" --force
  npx tsx linear-ops.ts update-issue ENG-123 description --file /tmp/description.md --force
  npx tsx linear-ops.ts list-initiatives
  npx tsx linear-ops.ts labels taxonomy
  npx tsx linear-ops.ts labels validate "feature,security,breaking-change"
  npx tsx linear-ops.ts labels suggest "Fix XSS vulnerability in login form"
  npx tsx linear-ops.ts labels agents "security,performance"
  npx tsx linear-ops.ts labels set SMI-1770 mcp,DX,feature
  npx tsx linear-ops.ts labels set ENG-123 bug,security --replace
  echo "$DRAFT_BODY" | npx tsx linear-ops.ts validate-description --stdin
  npx tsx linear-ops.ts validate-description --file /tmp/draft.md
`);
  }
};

// Main
async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    await commands['help']();
    return;
  }

  if (!commands[cmd]) {
    console.error(`Unknown command: ${cmd}\n`);
    console.error('Run with --help to see available commands');
    process.exit(1);
  }

  await commands[cmd](...args);
}

main().catch(error => {
  console.error('\n[ERROR]', error.message);
  process.exit(1);
});
