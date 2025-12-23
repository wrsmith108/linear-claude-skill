#!/usr/bin/env npx ts-node
/**
 * Update Linear issue status by issue numbers
 *
 * Usage:
 *   npx ts-node scripts/update-status.ts Done 550 551 552
 *   npx ts-node scripts/update-status.ts "In Progress" 553
 *
 * Environment:
 *   LINEAR_API_KEY - Required
 *
 * Available states: Backlog, Todo, In Progress, In Review, Done, Canceled
 */

const API_KEY = process.env.LINEAR_API_KEY;

if (!API_KEY) {
  console.error("Error: LINEAR_API_KEY environment variable is required");
  process.exit(1);
}

const [, , stateName, ...issueArgs] = process.argv;
const issueNumbers = issueArgs.map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));

if (!stateName || issueNumbers.length === 0) {
  console.error("Usage: npx ts-node scripts/update-status.ts <stateName> <issueNumber...>");
  console.error("Example: npx ts-node scripts/update-status.ts Done 550 551 552");
  console.error("States: Backlog, Todo, In Progress, In Review, Done, Canceled");
  process.exit(1);
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

async function graphql<T>(query: string): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: API_KEY!,
    },
    body: JSON.stringify({ query }),
  });

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data!;
}

interface WorkflowState {
  id: string;
  name: string;
}

interface Issue {
  id: string;
  identifier: string;
  number: number;
  title: string;
}

async function getWorkflowStateId(name: string, teamKey: string = "SMI"): Promise<string> {
  const query = `query {
    workflowStates(filter: { team: { key: { eq: "${teamKey}" } }, name: { eq: "${name}" } }) {
      nodes { id name }
    }
  }`;

  const data = await graphql<{ workflowStates: { nodes: WorkflowState[] } }>(query);

  if (data.workflowStates.nodes.length === 0) {
    throw new Error(`Workflow state "${name}" not found`);
  }

  return data.workflowStates.nodes[0].id;
}

async function getIssueUUIDs(numbers: number[]): Promise<Issue[]> {
  const query = `query {
    issues(filter: { number: { in: [${numbers.join(", ")}] } }) {
      nodes { id identifier number title }
    }
  }`;

  const data = await graphql<{ issues: { nodes: Issue[] } }>(query);
  return data.issues.nodes;
}

async function updateIssueStatus(
  issueId: string,
  stateId: string
): Promise<{ identifier: string; state: string }> {
  const query = `mutation {
    issueUpdate(id: "${issueId}", input: { stateId: "${stateId}" }) {
      success
      issue { identifier state { name } }
    }
  }`;

  const data = await graphql<{
    issueUpdate: { success: boolean; issue: { identifier: string; state: { name: string } } };
  }>(query);

  return {
    identifier: data.issueUpdate.issue.identifier,
    state: data.issueUpdate.issue.state.name,
  };
}

async function main() {
  try {
    // Get workflow state ID
    console.warn(`Looking up state "${stateName}"...`);
    const stateId = await getWorkflowStateId(stateName);
    console.warn(`Using state "${stateName}" (${stateId})`);

    // Get issue UUIDs
    console.warn(`\nFetching issues: ${issueNumbers.join(", ")}...`);
    const issues = await getIssueUUIDs(issueNumbers);

    if (issues.length === 0) {
      throw new Error("No matching issues found");
    }

    console.warn(`Found ${issues.length} issues\n`);

    // Update each issue
    for (const issue of issues) {
      try {
        const result = await updateIssueStatus(issue.id, stateId);
        console.warn(`✓ ${result.identifier} → ${result.state}`);
      } catch (error) {
        console.error(`✗ ${issue.identifier}: ${(error as Error).message}`);
      }
    }

    console.warn("\nDone!");
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
