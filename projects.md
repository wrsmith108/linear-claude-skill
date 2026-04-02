# Projects & Initiatives

Advanced project and initiative management patterns for Linear.

**For quick commands, see the main [SKILL.md](SKILL.md).**

---

## MANDATORY: Project Content & Updates

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

## Content vs Description (CRITICAL)

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

---

## Discovery Before Creation (MANDATORY)

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

## Codebase Verification Before Work (MANDATORY)

**ALWAYS verify codebase state before accepting Linear issue scope at face value.**

Issue descriptions may be **outdated** or **speculative** — written before code exploration. This is especially common when:
- Issues were created during planning, not after code review
- The codebase evolved since the issue was created
- API endpoints or features were implemented but not documented in Linear

**Key Lesson**: Issues describing "missing" APIs or features may already be implemented.

```bash
# Before starting any API/feature implementation issue:

# 1. Search for existing implementations
grep -r "apiEndpoint\|functionName" src/

# 2. Check if files already exist
ls src/pages/api/admin/members/  # If issue says "implement members API"

# 3. Read existing code
cat src/pages/api/admin/members/index.ts  # May already be complete!

# 4. Run tests to see what's actually failing
npx playwright test tests/e2e/journeys/admin/
```

**Checklist before accepting issue scope:**

| Check | Method | If Found |
|-------|--------|----------|
| API exists? | `ls src/pages/api/**/*.ts` | Update issue scope to "verify/test" |
| Feature implemented? | `grep -r "featureName" src/` | Mark implementation subtasks as done |
| Tests passing? | Run test suite | Focus on fixing failures, not reimplementing |
| Only tests skipped? | Check for `test.skip` | Real work is un-skipping + fixing assertions |

**Example: Scope Discovery**

Issue says: "Implement /api/admin/members CRUD endpoints"

**BEFORE starting:**
```bash
# Check if files exist
ls src/pages/api/admin/members/
# Output: index.ts  [id].ts  ← Files exist!

# Read the implementation
cat src/pages/api/admin/members/index.ts | head -50
# Output: Full implementation with GET, POST, auth checks

# Check why tests fail
grep -r "test.describe.skip" tests/e2e/journeys/admin/
# Output: member-management.spec.ts uses test.describe.skip
```

**CORRECTED scope**: "Un-skip E2E tests and fix any assertion failures" (not "implement API")

**Update Linear immediately when scope changes:**
```bash
node scripts/linear-helpers.mjs add-comment 123 "## Scope Update

**Discovery:** API endpoints are ALREADY COMPLETE!

### Actual Remaining Work
1. Un-skip journey tests
2. Fix any test assertion failures
3. Verify tests pass"
```

**NEVER assume issue descriptions are accurate. Verify codebase state first.**

---

## Sub-Issue Management (Parent-Child Relationships)

Linear supports hierarchical issue organization through parent-child relationships. Sub-issues (children) appear nested under their parent issue in the UI and inherit certain properties.

### When to Use Sub-Issues

| Scenario | Use Sub-Issues | Example |
|----------|----------------|---------|
| Feature breakdown | ✅ Yes | ENG-100 "Auth System" → ENG-101 "TDD tests", ENG-102 "E2E tests" |
| Related but independent | ❌ No | Two bugs in different areas (use labels instead) |
| Sequential phases | ✅ Yes | ENG-200 "Phase 1" → ENG-201 "Setup", ENG-202 "Implementation" |
| Tracking subtasks | ✅ Yes | Break down a large issue into trackable pieces |

### Commands

```bash
# Create a sub-issue (child) under a parent issue
# Inherits team and project from parent automatically
npm run ops -- create-sub-issue <parent-issue> <title> [description] [--priority 1-4] [--labels label1,label2]

# Set existing issues as children of a parent
npm run ops -- set-parent <parent-issue> <child-issues...>

# List all sub-issues of a parent
npm run ops -- list-sub-issues <parent-issue>
```

### Examples

```bash
# Create a sub-issue for unit tests under a parent feature issue
npm run ops -- create-sub-issue ENG-100 "Add unit tests" "Unit tests for new feature" --priority 2 --labels testing

# Link existing issues as children of a parent
npm run ops -- set-parent ENG-100 ENG-101 ENG-102

# List all sub-issues of a parent
npm run ops -- list-sub-issues ENG-100
```

### Notes

- **Inheritance**: Sub-issues automatically inherit the team from the parent
- **Project linking**: If the parent is in a project, sub-issues can also be added
- **Status independence**: Each issue maintains its own status (completing a sub-issue doesn't auto-complete the parent)
- **UI display**: Sub-issues appear indented under their parent in list views

---

## Linking Projects to Initiatives

**Use `initiativeToProjectCreate` to link an existing project to an initiative:**

```graphql
mutation {
  initiativeToProjectCreate(input: {
    initiativeId: "<initiative-uuid>",
    projectId: "<project-uuid>"
  }) {
    success
    initiativeToProject { id }
  }
}
```

**Example using query.ts:**

```bash
npm run query -- 'mutation {
  initiativeToProjectCreate(input: {
    initiativeId: "<initiative-uuid>",
    projectId: "<project-uuid>"
  }) {
    success
  }
}'
```

**Note:** This is different from setting `initiativeId` at project creation time. Use this mutation when:
- A project was created without an initiative link
- You need to add a project to an additional initiative
- Reorganizing projects between initiatives

---

## New Phase Project Pattern

**Step 0: Run Discovery Checks (see above)**

When creating a new phase, follow this complete workflow:

```bash
# 0. DISCOVERY - Check for existing project/issues first!
linear projects list | grep -i "phase N"

# 1. Create project via CLI (ONLY if Step 0 found nothing)
linear projects create --name "Phase N: Name" --description "Short summary"

# 2. Link to initiative (use initiativeToProjectCreate mutation - see above)
npm run query -- 'mutation { initiativeToProjectCreate(input: { initiativeId: "<uuid>", projectId: "<uuid>" }) { success } }'

# 3. Set content (main UI panel)
# Use GraphQL to set full markdown content

# 4. Add resource link to implementation doc
# Use entityExternalLinkCreate mutation

# 5. Create milestone for Definition of Done
# Use projectMilestoneCreate mutation

# 6. Create issues via MCP (check for existing first!)
# 7. Add issues to project
```

---

## ⚠️ MANDATORY: Project Creation Checklist

> **CRITICAL**: Every script that creates projects MUST follow this checklist.
> Skipping steps causes recurring issues with orphaned projects and missing links.

### Required Steps

| # | Step | How | Verify |
|---|------|-----|--------|
| 1 | **Link to initiative** | `initiativeToProjectCreate` mutation | Check initiative.projects |
| 2 | **Set description** | `description` field (255 char limit) | View in sidebar |
| 3 | **Set content** | `content` field via `projectUpdate` | View main panel |
| 4 | **Add resource links** | `entityExternalLinkCreate` mutation | Check Resources section |
| 5 | **Create milestones** | `projectMilestoneCreate` mutation | Check Milestones tab |
| 6 | **Ensure labels exist** | Use `lib/labels.ts` utilities | Query labels before/after |
| 7 | **Create issues with labels** | Include `labelIds` in `createIssue` | View issue labels |
| 8 | **Verify issue count** | Compare expected vs actual | Log counts |
| 9 | **Run verification** | Use `lib/verify.ts` | Check output |
| 10 | **Report failures** | Log all errors, don't fail silently | Review logs |

### Using Shared Utilities

**Always use the lib/ utilities** to avoid common mistakes:

```typescript
import {
  linkProjectToInitiative,
  ensureLabelsExist,
  verifyProjectCreation,
  createProject,
  createProjectWithDefaults,
  DEFAULT_INITIATIVE_ID
} from './lib'

// Option 1: Full template with explicit initiative
const result = await createProject(teamId, {
  name: 'My Project Phase X: Name',
  shortDescription: 'Short 255 char description',
  content: '# Full markdown content...',
  state: 'planned',
  initiative: '<your-initiative-uuid>',
  issues: [
    { title: 'Issue', description: 'Desc', labels: ['label1'] }
  ]
})

// Option 2: Use environment variable for initiative
// Requires: LINEAR_DEFAULT_INITIATIVE_ID=<uuid>
const result2 = await createProjectWithDefaults({
  name: 'My Project Phase X: Name',
  shortDescription: 'Short description',
  content: '# Full content...',
  state: 'planned',
  issues: []
})

// Option 3: Manual with utilities
const linkResult = await linkProjectToInitiative(projectId, initiativeId)
const labelResult = await ensureLabelsExist(teamId, ['label1', 'label2'])
const verification = await verifyProjectCreation('Phase X', expectedCount, undefined, initiativeId)
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LINEAR_API_KEY` | Yes | Your Linear API key |
| `LINEAR_DEFAULT_INITIATIVE_ID` | No | Default initiative for `createProjectWithDefaults()` |

### Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Using `initiativeIds` on `projectUpdate` | Silent failure | Use `initiativeToProjectCreate` mutation |
| Long description | Truncated in UI | Use `content` for full text, `description` for summary |
| Case-sensitive label lookup | Labels not applied | Use case-insensitive map (`name.toLowerCase()`) |
| Silent failures | Missing issues/labels | Always check result, log errors |
| No post-verification | Issues discovered later | Run `lib/verify.ts` after creation |

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

---

## Project Status (IMPORTANT)

**Project status is NOT auto-updated when issues move.** You must explicitly update project status.

### Project Status vs Issue Status

| Concept | Applies To | Field | Auto-Updates? |
|---------|------------|-------|---------------|
| **Issue Status** | Individual issues | `stateId` | Yes (via workflow) |
| **Project Status** | Entire project | `statusId` | ❌ No - manual only |

### Status Types and UUIDs

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

### When to Update Project Status

Update project status at these transition points:

| Trigger | New Status | Check |
|---------|------------|-------|
| First issue moves to "In Progress" | `In Progress` | Any issue has `started` state |
| All issues complete | `Completed` | No issues in backlog/progress |
| Work begins on phase | `In Progress` | Manual or first issue started |
| Phase fully implemented | `Completed` | All tests pass, PR merged |

### Update Project Status

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

### Check Project Issue Progress

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

### Helper: Update Project Status Script

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

---

## Project Updates (Status Reports)

Post status updates to a project's Updates tab. These are visible at `/project/{slug}/updates`.

### Create Project Update

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

### Example: Post Progress Update

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

### When to Post Updates

| Trigger | Health | Content |
|---------|--------|---------|
| Work starts (swarm launched) | `onTrack` | Progress %, what's in progress |
| Milestone reached | `onTrack` | Completed items, next steps |
| Blockers encountered | `atRisk` | Issue description, mitigation plan |
| Deadline at risk | `offTrack` | Root cause, revised timeline |
| Phase complete | `onTrack` | Summary, metrics, lessons learned |
