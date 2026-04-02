# Linear Sync Patterns

Auto-synchronize code changes with Linear issues using parallel agents. Ensures Linear reflects implementation progress in real-time.

## When to Use

Invoke sync when:
- Completing implementation of Linear issues (ENG-XXX)
- Finishing bug fixes referenced in commits
- Closing out a phase with multiple issues
- Before creating PRs (ensure Linear reflects current state)

## Sync Modes

### Mode 1: CLI Bulk Sync

Update multiple issues to a target state:

```bash
# Via SDK script
npm run sync -- --issues ENG-432,ENG-433,ENG-434 --state Done

# Update project status
npm run sync -- --project "Current Phase" --state completed
```

### Mode 2: Agent-Spawned Sync

Spawn a parallel agent via Task tool for autonomous sync:

```javascript
Task({
  description: "Sync Current Phase to Linear",
  prompt: `
    Update these Linear issues to Done status:
    ENG-432, ENG-433, ENG-434, ENG-435, ENG-436, ENG-437

    Then update project "Current Phase" status to "completed".

    Use GraphQL mutations (MCP times out on bulk ops).
    Report success/failure counts.
  `,
  subagent_type: "Linear-specialist"
})
```

### Mode 3: Hook-Triggered Sync

Auto-suggest sync after code edits (requires hook setup).

Add to `.claude/settings.json`:

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

The hook detects Linear issue references in changed files and outputs context for Claude to consider syncing.

## Bulk Operations

### Bulk Update Issues

```bash
# Update multiple issues to Done
npm run sync -- --issues ENG-432,ENG-433,ENG-434,ENG-435 --state Done

# Output:
# ✅ ENG-432 → Done
# ✅ ENG-433 → Done
# ✅ ENG-434 → Done
# ✅ ENG-435 → Done
# Synced 4/4 issues to Done
```

### Update Project Status

```bash
# By project name (searches for match)
npm run sync -- --project "Current Phase" --state completed

# By project UUID (direct)
npm run sync -- --project-id f41c0e8b-c59c-4aa1-8f50-d44c2820396f --state completed
```

### Combined Sync

```bash
# Update issues AND project in one command
npm run sync -- \
  --issues ENG-432,ENG-433,ENG-434 \
  --state Done \
  --project "Current Phase" \
  --project-state completed
```

## AgentDB Integration

For swarm coordination, store sync state in AgentDB:

```bash
# Store pending sync context
npx claude-flow memory store "linear:pending_sync" '["ENG-432","ENG-433"]' --namespace current-phase

# Agent reads and processes
npx claude-flow memory get "linear:pending_sync" --namespace current-phase

# Store results for verification
npx claude-flow memory store "linear:sync_results" '{"done":16,"failed":0}' --namespace current-phase
```

### Swarm Sync Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATOR                               │
│   Stores: current-phase:pending_sync = ["ENG-432", "ENG-433"...]  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐          ┌───────────────┐
│  sync-agent-1 │          │  sync-agent-2 │
│  ENG-432-437  │          │  ENG-441-448  │
└───────┬───────┘          └───────┬───────┘
        │                          │
        └──────────┬───────────────┘
                   ▼
          ┌──────────────────┐
          │     AgentDB      │
          │ sync_results: {} │
          └──────────────────┘
```

## Parallel Agent Pattern

Spawn multiple sync agents for independent issue batches:

```javascript
// Parallel execution via Task tool (single message, multiple calls)
[
  Task({
    description: "Sync ENG-432-437",
    prompt: "Update ENG-432,433,434,435,436,437 to Done via GraphQL",
    subagent_type: "Linear-specialist"
  }),
  Task({
    description: "Sync ENG-441-448",
    prompt: "Update ENG-441,442,443,444,446,447,448 to Done via GraphQL",
    subagent_type: "Linear-specialist"
  }),
  Task({
    description: "Update project status",
    prompt: "Update project 'Current Phase' to completed state",
    subagent_type: "Linear-specialist"
  })
]
```

## Verification

Always verify sync completed successfully:

```bash
# Query updated issues
npm run sync -- --verify ENG-432,ENG-433,ENG-434 --expected-state Done

# Output:
# ✅ ENG-432: Done
# ✅ ENG-433: Done
# ✅ ENG-434: Done
# Verification passed: 3/3 in expected state
```

## Error Handling

Linear API can fail silently. The sync script handles:

- **Rate limiting**: 100ms delay between mutations
- **Timeout recovery**: Retries failed operations once
- **Partial failure**: Reports individual issue failures
- **State validation**: Verifies updates took effect

```bash
# With verbose output for debugging
npm run sync -- --issues ENG-432,ENG-433 --state Done --verbose

# Output includes:
# [DEBUG] Getting workflow state ID for "Done"
# [DEBUG] State ID: 12911ddd-92bf-41dd-866b-8071290cb250
# [DEBUG] Getting UUIDs for 2 issues
# [DEBUG] Updating ENG-432 (bcbb5f01-8a08-4f25-916c-c8d56f2eb671)
# ✅ ENG-432 → Done
# ...
```

## Common Workflows

### Post-Implementation Sync

After completing a feature:

```bash
# 1. Identify issues from git commits
git log --oneline -10 | grep -oE 'ENG-[0-9]+'

# 2. Bulk update to Done
npm run sync -- --issues ENG-432,ENG-433,ENG-434 --state Done

# 3. Update project status
npm run sync -- --project "Current Phase" --state completed

# 4. Verify
npm run sync -- --verify ENG-432,ENG-433,ENG-434 --expected-state Done
```

### Phase Completion Sync

When closing out a phase:

```bash
# Get all phase issues
npm run sync -- --list-project "Current Phase"

# Review which need updating
# ... identify issues still in Backlog/In Progress ...

# Bulk update implemented issues
npm run sync -- \
  --issues ENG-432,ENG-433,...,ENG-472 \
  --state Done

# Update project to completed
npm run sync -- --project "Current Phase" --state completed
```

### PR Preparation Sync

Before creating a PR:

```bash
# Ensure all referenced issues are updated
npm run sync -- \
  --from-branch feature/search-modal \
  --state "In Review"
```

## Reference

- **SKILL.md**: Main Linear skill documentation
- **api.md**: GraphQL API reference
- **sdk.md**: SDK automation patterns
- **scripts/sync.ts**: Sync script implementation
