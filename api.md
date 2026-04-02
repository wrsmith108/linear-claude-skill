# Linear GraphQL API

Documentation for querying the Linear API directly when the MCP tools don't support a specific operation.

## Authentication

**Endpoint**: `https://api.linear.app/graphql`

**Authentication Header**:
```
Authorization: <API_KEY>
```

Personal API keys are available in Linear under Security & access settings.

## Using the Linear SDK

For ad-hoc queries and automation, use the `@linear/sdk` package with `npx` and TypeScript.

### Setup

The skill includes `scripts/query.ts` for executing GraphQL queries. Run it with:

```bash
LINEAR_API_KEY=lin_api_xxx npm run query -- "query { viewer { id name } }"
```

**Environment Variable**: The script requires `LINEAR_API_KEY` to be set. If not provided to the Claude process, you cannot execute GraphQL queries automatically.

### Example Queries

**Get authenticated user:**
```graphql
query Me {
  viewer {
    id
    name
    email
  }
}
```

**Get team issues:**
```graphql
query Team($teamId: String!) {
  team(id: $teamId) {
    issues {
      nodes {
        id
        title
        state { name }
        assignee { name }
      }
    }
  }
}
```

**Get user's assigned issues:**
```graphql
query MyIssues {
  viewer {
    assignedIssues {
      nodes {
        id
        title
        state { name }
        team { key }
      }
    }
  }
}
```

### Mutations

**Create issue:**
```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
    }
  }
}
```

With variables:
```json
{
  "input": {
    "teamId": "TEAM_ID",
    "title": "Issue title",
    "description": "Issue description",
    "stateId": "STATE_ID",
    "projectId": "PROJECT_ID"
  }
}
```

**Update issue:**
```graphql
mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id
      title
      state { name }
    }
  }
}
```

**Look up project by name:**
```graphql
query ProjectByName($filter: ProjectFilter!) {
  projects(filter: $filter, first: 10) {
    nodes {
      id
      name
      state
      slugId
    }
  }
}
```

With variables:
```json
{
  "filter": {
    "name": { "containsIgnoreCase": "Phase 6A" }
  }
}
```

## Rate Limiting

Monitor HTTP status codes and handle rate limits appropriately. For real-time updates, Linear recommends using webhooks instead of polling.

## Key Concepts

- **Team IDs**: Required for most operations involving issues and projects
- **State IDs**: Issues default to the team's first Backlog state unless specified
- **Archived Resources**: Hidden by default; use `includeArchived: true` to retrieve
- **Error Handling**: Always check the `errors` array in responses before assuming success

## Using linear-sdk Directly

For more complex automation, you can use the Linear SDK programmatically:

```typescript
import { LinearClient } from '@linear/sdk';

const client = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY
});

// Get viewer
const me = await client.viewer;
console.log(me.name);

// Get issues
const issues = await client.issues({
  filter: { assignee: { id: { eq: me.id } } }
});

for (const issue of issues.nodes) {
  console.log(`${issue.identifier}: ${issue.title}`);
}
```

---

## Timeout Handling Patterns

When operations take longer than expected, use these patterns to maintain reliability.

### Progress Notifications

For bulk operations, notify the user of progress:

```javascript
const issues = ['PROJ-101', 'PROJ-102', 'PROJ-103'];
for (let i = 0; i < issues.length; i++) {
  console.log(`Processing ${i + 1}/${issues.length}: ${issues[i]}`);
  // ... operation
}
```

### Chunked Batch Operations

Break large batches into smaller chunks to avoid timeouts:

```javascript
const BATCH_SIZE = 10;
const DELAY_MS = 150; // Avoid rate limiting

for (let i = 0; i < issues.length; i += BATCH_SIZE) {
  const batch = issues.slice(i, i + BATCH_SIZE);
  console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: Processing ${batch.length} issues`);

  for (const issue of batch) {
    await processIssue(issue);
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}
```

### Fallback on Timeout

Detect timeouts and fall back to GraphQL:

```javascript
try {
  // Try MCP first (faster when it works)
  await mcp__linear__linear_search_issues({ query: "keyword" });
} catch (error) {
  if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
    console.log('MCP timed out, falling back to GraphQL...');
    // Use GraphQL workaround (see below)
  }
}
```

### Bulk Sync Script

Use `scripts/sync.ts` for reliable bulk state updates:

```bash
# Update multiple issues to Done state (replace PROJ with your team prefix)
LINEAR_API_KEY=lin_api_xxx npm run sync -- --issues PROJ-101,PROJ-102,PROJ-103 --state Done

# Preview changes without applying
LINEAR_API_KEY=lin_api_xxx npm run sync -- --issues PROJ-101,PROJ-102 --state Done --dry-run

# Add comment with state change
LINEAR_API_KEY=lin_api_xxx npm run sync -- --issues PROJ-101 --state Done --comment "Completed in PR #42"
```

---

## MCP Timeout Workarounds

When MCP times out or fails, use these direct GraphQL patterns.

### ⚠️ Shell Script Compatibility

**IMPORTANT**: When writing inline Node.js scripts in bash, avoid JavaScript features that confuse shell parsing:

| Feature | Problem | Solution |
|---------|---------|----------|
| Optional chaining `?.` | Shell sees `?` as glob | Use explicit null checks |
| Nullish coalescing `??` | Double `?` confuses parser | Use ternary `? :` |
| Heredocs with `${}` | Shell interpolation | Use `<< 'EOF'` (quoted) |

**Anti-Pattern (breaks in bash):**
```javascript
// ❌ Optional chaining breaks shell parsing
const name = project.status?.name;
```

**Correct Pattern:**
```javascript
// ✅ Explicit null check works everywhere
const name = project.status ? project.status.name : 'No status';
```

**Heredoc Pattern:**
```bash
# ✅ Use quoted EOF to prevent shell interpolation
node --input-type=module << 'ENDSCRIPT'
const value = obj.prop ? obj.prop.nested : 'default';
ENDSCRIPT
```

### Search Issues (when MCP times out)

```javascript
// Inline GraphQL via node --experimental-fetch
node --experimental-fetch -e "
async function searchIssues() {
  const query = \`
    query {
      issues(filter: {
        team: { key: { eq: \"TEAM\" } }
        state: { type: { nin: [\"completed\", \"canceled\"] } }
      }, first: 25) {
        nodes {
          id identifier title state { name } priority
        }
      }
    }
  \`;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': process.env.LINEAR_API_KEY
    },
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  data.data.issues.nodes.forEach(i => {
    console.log(\`\${i.identifier}: \${i.title} [\${i.state.name}]\`);
  });
}
searchIssues();
"
```

### Update Issue Status (when MCP is unreliable)

```javascript
// First get the workflow state ID for "Done"
const stateQuery = \`
  query {
    workflowStates(filter: { team: { key: { eq: \"TEAM\" } }, name: { eq: \"Done\" } }) {
      nodes { id name }
    }
  }
\`;

// Then update the issue
const mutation = \`
  mutation {
    issueUpdate(id: "\${issueUuid}", input: { stateId: "\${doneStateId}" }) {
      success
      issue { identifier state { name } }
    }
  }
\`;
```

### Add Comment (MCP fails with UUIDs)

```javascript
// Get issue UUID from identifier
const issueQuery = \`
  query {
    issues(filter: { number: { in: [123, 124, 125] } }) {
      nodes { id identifier }
    }
  }
\`;

// Add comment using UUID
const mutation = \`
  mutation {
    commentCreate(input: {
      issueId: "\${issueUuid}",
      body: "Implementation complete. See PR #42."
    }) { success }
  }
\`;
```

**Pro Tip**: Store frequently-used IDs (team UUID, common state UUIDs) in your project's CLAUDE.md to avoid repeated lookups.

---

## Reference

- [Linear GraphQL Documentation](https://linear.app/developers/graphql)
- [Linear SDK](https://github.com/linear/linear/tree/master/packages/sdk)

Use GraphQL introspection to discover the API schema:

```bash
LINEAR_API_KEY=lin_api_xxx npm run query -- "{ __schema { types { name description } } }"
```
