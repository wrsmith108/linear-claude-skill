---
name: Linear
description: Managing Linear issues, projects, and teams. Use when working with Linear tasks, creating issues, updating status, querying projects, or managing team workflows.
allowed-tools:
  - mcp__linear
  - WebFetch(domain:linear.app)
  - Bash
---

# Linear

Tools and workflows for managing issues, projects, and teams in Linear.

## Tool Selection

Choose the right tool for the task:

1. **MCP tools** - Use for simple operations (create/update/query single issues, basic filters)
2. **SDK scripts** - Use for complex operations (loops, bulk updates, conditional logic, data transformations)
3. **GraphQL API** - Fallback for operations not supported by MCP or SDK

### MCP Reliability Matrix

**IMPORTANT**: The Linear MCP server has known reliability issues. Use this matrix:

| Operation | MCP Tool | Reliability | Recommended |
|-----------|----------|-------------|-------------|
| Create issue | `linear_create_issue` | ✅ High | MCP |
| Search issues | `linear_search_issues` | ⚠️ Times out | GraphQL |
| Get user issues | `linear_get_user_issues` | ⚠️ May timeout | GraphQL |
| Update issue status | `linear_update_issue` | ⚠️ Unreliable | GraphQL |
| Add comment | `linear_add_comment` | ❌ Fails with UUIDs | GraphQL |

**Pattern**: Use MCP for issue creation, but fall back to direct GraphQL for searches, status updates, and comments.

### Why MCP Fails (Root Cause)

The 34% timeout rate has a specific technical cause:

**SSE Connection Drops**: MCP uses Server-Sent Events (SSE) for communication. Most HTTP servers and proxies close an SSE response that stays silent for several minutes. Because Linear's MCP endpoint sends **no keep-alive heartbeat** while idle, the connection hits this "body timeout" and terminates.

Linear acknowledges this in their docs:
> "Remote MCP connections are still early and we've found that the connection may fail or require multiple attempts."

**Implications**:
- Operations taking >30 seconds often timeout
- Idle connections drop after ~5 minutes
- Search operations with large result sets are particularly vulnerable
- Comments fail because UUID resolution adds latency

**Mitigation**: The reliability routing matrix above encodes these learnings—use MCP only for fast, reliable operations (issue creation), and GraphQL for everything else.

## Critical Requirements

### ⚠️ MANDATORY: Issues → Projects → Initiatives

**Every issue MUST be attached to a project. Every project MUST be linked to an initiative.**

Orphaned issues and projects are invisible in roadmap views and break tracking.

| Entity | Must Link To | Consequence if Missing |
|--------|--------------|------------------------|
| Issue | Project | Not visible in project board |
| Project | Initiative | Not visible in initiative roadmap |

**Anti-Pattern (NEVER DO):**
```bash
# ❌ Creating orphaned issues
mcp__linear__linear_create_issue with title="My task"
# Issue exists but is not part of any project!
```

**Correct Pattern (ALWAYS DO):**
```bash
# ✅ Create issue AND add to project in same workflow
mcp__linear__linear_create_issue with title="My task" ...
node scripts/linear-helpers.mjs add-issues-to-project <projectId> <issueNumber>

# ✅ Create project AND link to initiative
linear projects create --name "Phase N: Name"
node scripts/linear-helpers.mjs link-project <projectId>
```

### Helper Script: Update Issue Status

Use the helper script for reliable status updates:

```bash
# Update multiple issues to Done
node scripts/linear-helpers.mjs update-status Done 550 551 552

# Available states: Backlog, Todo, In Progress, In Review, Done, Canceled
```

This is more reliable than MCP's `linear_update_issue` which has known issues.

---

## Conventions

### Issue Status

When creating issues, set the appropriate status based on assignment:

- **Assigned to me** (`assignee: "me"`): Set `state: "Todo"`
- **Unassigned**: Set `state: "Backlog"`

Example:
```typescript
// Issue for myself
await linear.create_issue({
  team: "ENG",
  title: "Fix authentication bug",
  assignee: "me",
  state: "Todo"
})

// Unassigned issue
await linear.create_issue({
  team: "ENG",
  title: "Research API performance",
  state: "Backlog"
})
```

### Querying Issues

Use `assignee: "me"` to filter issues assigned to the authenticated user:

```typescript
// My issues
await linear.list_issues({ assignee: "me" })

// Team backlog
await linear.list_issues({ team: "ENG", state: "Backlog" })
```

### Labels

You can use label names directly in `create_issue` and `update_issue` - no need to look up IDs:

```typescript
await linear.create_issue({
  team: "ENG",
  title: "Update documentation",
  labels: ["documentation", "high-priority"]
})
```

## SDK Automation Scripts

**Use only when MCP tools are insufficient.** For complex operations involving loops, mapping, or bulk updates, write TypeScript scripts using `@linear/sdk`. See `sdk.md` for:

- Complete script patterns and templates
- Common automation examples (bulk updates, filtering, reporting)
- Tool selection criteria

Scripts provide full type hints and are easier to debug than raw GraphQL for multi-step operations.

## GraphQL API

**Fallback only.** Use when operations aren't supported by MCP or SDK. See `api.md` for documentation on using the Linear GraphQL API directly.

### Timeout Handling Patterns

When operations take longer than expected, use these patterns to maintain reliability:

**1. Progress Notifications**
For bulk operations, notify the user of progress:

```javascript
const issues = ['SMI-432', 'SMI-433', 'SMI-434'];
for (let i = 0; i < issues.length; i++) {
  console.log(`Processing ${i + 1}/${issues.length}: ${issues[i]}`);
  // ... operation
}
```

**2. Chunked Batch Operations**
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

**3. Fallback on Timeout**
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

**4. Bulk Sync Script**
Use `scripts/sync.ts` for reliable bulk state updates:

```bash
# Update multiple issues to Done state
LINEAR_API_KEY=lin_api_xxx npx tsx scripts/sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

# Preview changes without applying
LINEAR_API_KEY=lin_api_xxx npx tsx scripts/sync.ts --issues SMI-432,SMI-433 --state Done --dry-run

# Add comment with state change
LINEAR_API_KEY=lin_api_xxx npx tsx scripts/sync.ts --issues SMI-432 --state Done --comment "Completed in PR #42"
```

### MCP Timeout Workarounds

When MCP times out or fails, use these direct GraphQL patterns:

#### ⚠️ Shell Script Compatibility

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

#### Search Issues (when MCP times out)

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

#### Update Issue Status (when MCP is unreliable)

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

#### Add Comment (MCP fails with UUIDs)

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

### Ad-Hoc Queries

Use `scripts/query.ts` to execute GraphQL queries:

```bash
LINEAR_API_KEY=lin_api_xxx node scripts/query.ts "query { viewer { id name } }"
```

If `LINEAR_API_KEY` is not provided to the Claude process, inform the user that GraphQL queries cannot be executed without an API key.

## Projects & Initiatives

### MANDATORY: Project Content & Updates

**Every project operation MUST include these steps. Never skip them.**

When **creating** a project:
1. ✅ Set `content` (full markdown for main panel)
2. ✅ Set `description` (255 char summary for lists)
3. ✅ Link to parent initiative
4. ✅ Add resource links (docs, repos)
5. ✅ Create initial project update with scope

When **updating** project status:
1. ✅ Update `statusId` to new status
2. ✅ Create project update documenting the change
3. ✅ Include progress metrics (X/Y issues complete)

When **completing** work:
1. ✅ Update issue statuses to Done
2. ✅ Update project status to match
3. ✅ Create final project update with summary

**Example: Mandatory Project Update**

```javascript
// ALWAYS create an update when project status changes
node --experimental-fetch -e "
const PROJECT_ID = '<uuid>';

const update = \`## Status: In Progress 🚀

**Date:** $(date '+%Y-%m-%d')

### Completed
- ✅ Task 1 done
- ✅ Task 2 done

### In Progress
- 🔄 Task 3 in progress

### Up Next
- 📝 Task 4 pending
\`;

const mutation = \`mutation {
  projectUpdateCreate(input: {
    projectId: \\\"\${PROJECT_ID}\\\",
    body: \${JSON.stringify(update)},
    health: onTrack
  }) { success projectUpdate { url } }
}\`;

fetch('https://api.linear.app/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': process.env.LINEAR_API_KEY },
  body: JSON.stringify({ query: mutation })
}).then(r => r.json()).then(d => console.log('Update created:', d.data?.projectUpdateCreate?.projectUpdate?.url));
"
```

---

### Content vs Description (CRITICAL)

Linear has **two text fields** - using the wrong one causes blank displays:

| Field | Limit | Shows In | Use For |
|-------|-------|----------|---------|
| `description` | 255 chars | List views, tooltips | Short summary |
| `content` | Unlimited | **Main detail panel** | Full markdown documentation |

**Always set BOTH when creating/updating projects:**

```graphql
# Content is what users see in the main panel!
mutation {
  projectUpdate(id: "<uuid>", input: {
    content: "# Project Title\n\nFull markdown description...",
    description: "Short 255 char summary for list views"
  }) { success }
}
```

### Discovery Before Creation (MANDATORY)

**ALWAYS check Linear before creating ANY project or issue.** Skipping this step causes duplicate projects and wasted effort.

```bash
# Check for existing projects
linear projects list | grep -i "phase\|<feature-name>"

# Check for existing issues (MCP may timeout - use CLI as fallback)
linear issues list --filter "title:Phase N"
# Or: mcp__linear__linear_search_issues with query="Phase N feature"
```

**Checklist before ANY create operation:**

| Check | Command | Action if Found |
|-------|---------|-----------------|
| Project exists? | `linear projects list \| grep -i "name"` | Use existing UUID, skip creation |
| Issues exist? | `linear issues list --filter "title:keyword"` | Review existing, update if needed |
| Initiative linked? | Check project in Linear UI | Skip link-project step |

**NEVER skip discovery. Duplicate projects waste time and create confusion.**

---

### New Phase Project Pattern

**Step 0: Run Discovery Checks (see above)**

When creating a new phase, follow this complete workflow:

```bash
# 0. DISCOVERY - Check for existing project/issues first!
linear projects list | grep -i "phase N"

# 1. Create project via CLI (ONLY if Step 0 found nothing)
linear projects create --name "Phase N: Name" --description "Short summary"

# 2. Link to initiative
node scripts/linear-helpers.mjs link-project <project-id>

# 3. Set content (main UI panel)
# Use GraphQL to set full markdown content

# 4. Add resource link to implementation doc
# Use entityExternalLinkCreate mutation

# 5. Create milestone for Definition of Done
# Use projectMilestoneCreate mutation

# 6. Create issues via MCP (check for existing first!)
# 7. Add issues to project
```

### Resource Links

Add clickable links to projects/initiatives (shows in Resources section):

```graphql
mutation {
  entityExternalLinkCreate(input: {
    url: "https://github.com/org/repo/blob/main/docs/implementation/phase-N.md",
    label: "Implementation Doc",
    projectId: "<project-uuid>"
  }) { success }
}
```

**Standard resource links for phases:**
- `Implementation Doc` → docs/implementation/phase-N-*.md
- `Production Site` → deployment URL (for initiative)
- `Repository` → GitHub repo link (for initiative)

### Project Milestones (Definition of Done)

Track completion criteria with milestones:

```graphql
mutation {
  projectMilestoneCreate(input: {
    projectId: "<uuid>",
    name: "DoD: Testing",
    description: "Unit tests, E2E tests, 100% coverage"
  }) { success }
}
```

**Standard DoD milestones:**
- `DoD: Core Feature` - Main functionality complete
- `DoD: Testing` - All tests pass, coverage met
- `DoD: Security` - Security requirements verified
- `DoD: Accessibility` - A11y requirements met

### Project Status (IMPORTANT)

**Project status is NOT auto-updated when issues move.** You must explicitly update project status.

#### Project Status vs Issue Status

| Concept | Applies To | Field | Auto-Updates? |
|---------|------------|-------|---------------|
| **Issue Status** | Individual issues | `stateId` | Yes (via workflow) |
| **Project Status** | Entire project | `statusId` | ❌ No - manual only |

#### Status Types and UUIDs

Query your workspace's status UUIDs (workspace-specific):

```graphql
query { projectStatuses { nodes { id name type } } }
```

**Standard Status Types:**

| Status | Type | When to Use |
|--------|------|-------------|
| `Backlog` | `backlog` | Project created but not started |
| `Planned` | `planned` | Project scheduled, issues created |
| `In Progress` | `started` | **Issues actively being worked** |
| `Completed` | `completed` | All issues done |
| `Canceled` | `canceled` | Project abandoned |

#### When to Update Project Status

Update project status at these transition points:

| Trigger | New Status | Check |
|---------|------------|-------|
| First issue moves to "In Progress" | `In Progress` | Any issue has `started` state |
| All issues complete | `Completed` | No issues in backlog/progress |
| Work begins on phase | `In Progress` | Manual or first issue started |
| Phase fully implemented | `Completed` | All tests pass, PR merged |

#### Update Project Status

```graphql
mutation {
  projectUpdate(id: "<project-uuid>", input: {
    statusId: "<status-uuid>"
  }) {
    success
    project { name status { name } }
  }
}
```

#### Check Project Issue Progress

Before updating status, check issue states:

```graphql
query {
  project(id: "<project-uuid>") {
    name
    status { name }
    issues {
      nodes {
        identifier
        state { name type }
      }
    }
  }
}
```

**Logic for auto-determining status:**
- If ANY issue has `state.type = "started"` → Project is `In Progress`
- If ALL issues have `state.type = "completed"` → Project is `Completed`
- If NO issues started → Project is `Planned` or `Backlog`

#### Helper: Update Project Status Script

```javascript
// Check project issues and update status accordingly
node -e "
const PROJECT_ID = '<project-uuid>';

// Status UUIDs (query your workspace for these)
const STATUS = {
  backlog: '1ed7da89-db44-4339-b0d7-ce37d8ff9604',
  planned: '33ebbb84-53ea-4dd8-a8db-49a8b3b9c502',
  inProgress: '71d18c8f-53de-4752-be37-a6d529cb9c97',
  completed: '54294a72-010d-4ae7-9829-bed76232fb66'
};

async function updateProjectStatus() {
  // Get project issues
  const issueQuery = \`query {
    project(id: \"${PROJECT_ID}\") {
      name
      issues { nodes { state { type } } }
    }
  }\`;

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.LINEAR_API_KEY },
    body: JSON.stringify({ query: issueQuery })
  });
  const { data } = await res.json();

  const issues = data.project.issues.nodes;
  const states = issues.map(i => i.state.type);

  // Determine appropriate status
  let newStatus;
  if (states.every(s => s === 'completed')) {
    newStatus = STATUS.completed;
  } else if (states.some(s => s === 'started')) {
    newStatus = STATUS.inProgress;
  } else {
    newStatus = STATUS.planned;
  }

  // Update project
  const mutation = \`mutation {
    projectUpdate(id: \"${PROJECT_ID}\", input: { statusId: \"${newStatus}\" }) {
      success
      project { name status { name } }
    }
  }\`;

  const updateRes = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': process.env.LINEAR_API_KEY },
    body: JSON.stringify({ query: mutation })
  });
  const result = await updateRes.json();
  console.log('Updated:', result.data.projectUpdate.project);
}

updateProjectStatus();
"
```

### Project Updates (Status Reports)

Post status updates to a project's Updates tab. These are visible at `/project/{slug}/updates`.

#### Create Project Update

```graphql
mutation {
  projectUpdateCreate(input: {
    projectId: "<project-uuid>",
    body: "## Status Update\n\nMarkdown content here...",
    health: onTrack
  }) {
    success
    projectUpdate {
      id
      url
      createdAt
    }
  }
}
```

**Health Options:**
- `onTrack` - 🟢 Project proceeding as planned
- `atRisk` - 🟡 Issues that may cause delays
- `offTrack` - 🔴 Project is behind schedule

#### Example: Post Progress Update

```javascript
node -e "
const projectId = '<project-uuid>';

const updateBody = \`## Status: In Progress 🚀

**Swarm execution started** — agents actively implementing features.

### Progress
- **32% complete** (9/28 issues done)
- Project status updated to **In Progress**

### Completed
- ✅ Foundation setup
- ✅ Core configuration

### In Progress
- 🔄 Main feature implementation
- 🔄 UI components

### Up Next
- Testing suite
- Documentation
\`;

const mutation = \`mutation {
  projectUpdateCreate(input: {
    projectId: \\\"\${projectId}\\\",
    body: \${JSON.stringify(updateBody)},
    health: onTrack
  }) {
    success
    projectUpdate { id }
  }
}\`;

fetch('https://api.linear.app/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': process.env.LINEAR_API_KEY },
  body: JSON.stringify({ query: mutation })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2)));
"
```

#### When to Post Updates

| Trigger | Health | Content |
|---------|--------|---------|
| Work starts (swarm launched) | `onTrack` | Progress %, what's in progress |
| Milestone reached | `onTrack` | Completed items, next steps |
| Blockers encountered | `atRisk` | Issue description, mitigation plan |
| Deadline at risk | `offTrack` | Root cause, revised timeline |
| Phase complete | `onTrack` | Summary, metrics, lessons learned |

---

## Sync Patterns (Bulk Operations)

For bulk synchronization of code changes to Linear, see `sync.md`.

### Quick Sync Commands

```bash
# Bulk update issues to Done
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

# Update project status
npx ts-node scripts/sync.ts --project "Phase 11" --state completed

# Verify sync completed
npx ts-node scripts/sync.ts --verify SMI-432,SMI-433 --expected-state Done
```

### Agent-Spawned Sync

Spawn a parallel agent for autonomous sync:

```javascript
Task({
  description: "Sync Phase 11 to Linear",
  prompt: "Update SMI-432,433,434 to Done. Then update project 'Phase 11' to completed.",
  subagent_type: "general-purpose"
})
```

### Hook-Triggered Sync

Auto-suggest sync after code edits. Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.claude/skills/linear/hooks/post-edit.sh"
      }]
    }]
  }
}
```

See `sync.md` for complete patterns including AgentDB integration and swarm coordination.

---

## Reference

- Linear MCP: https://linear.app/docs/mcp.md
- GraphQL API: See `api.md`
- SDK Automation: See `sdk.md`
- Bulk Sync: See `sync.md`
