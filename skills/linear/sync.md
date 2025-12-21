# Linear Sync Patterns

Auto-synchronize code changes with Linear issues using parallel agents. Ensures Linear reflects implementation progress in real-time.

## When to Use

Invoke sync when:
- Completing implementation of Linear issues (SMI-XXX)
- Finishing bug fixes referenced in commits
- Closing out a phase with multiple issues
- Before creating PRs (ensure Linear reflects current state)

## Sync Modes

### Mode 1: CLI Bulk Sync

Update multiple issues to a target state:

```bash
# Via SDK script
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

# Update project status
npx ts-node scripts/sync.ts --project "Phase 11: Search" --state completed
```

### Mode 2: Agent-Spawned Sync

Spawn a parallel agent via Task tool for autonomous sync:

```javascript
Task({
  description: "Sync Phase 11 to Linear",
  prompt: `
    Update these Linear issues to Done status:
    SMI-432, SMI-433, SMI-434, SMI-435, SMI-436, SMI-437

    Then update project "Phase 11: Search" status to "completed".

    Use GraphQL mutations (MCP times out on bulk ops).
    Report success/failure counts.
  `,
  subagent_type: "general-purpose"
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
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433,SMI-434,SMI-435 --state Done

# Output:
# ✅ SMI-432 → Done
# ✅ SMI-433 → Done
# ✅ SMI-434 → Done
# ✅ SMI-435 → Done
# Synced 4/4 issues to Done
```

### Update Project Status

```bash
# By project name (searches for match)
npx ts-node scripts/sync.ts --project "Phase 11" --state completed

# By project UUID (direct)
npx ts-node scripts/sync.ts --project-id f41c0e8b-c59c-4aa1-8f50-d44c2820396f --state completed
```

### Combined Sync

```bash
# Update issues AND project in one command
npx ts-node scripts/sync.ts \
  --issues SMI-432,SMI-433,SMI-434 \
  --state Done \
  --project "Phase 11" \
  --project-state completed
```

## AgentDB Integration

For swarm coordination, store sync state in AgentDB:

```bash
# Store pending sync context
npx claude-flow memory store "linear:pending_sync" '["SMI-432","SMI-433"]' --namespace phase11

# Agent reads and processes
npx claude-flow memory get "linear:pending_sync" --namespace phase11

# Store results for verification
npx claude-flow memory store "linear:sync_results" '{"done":16,"failed":0}' --namespace phase11
```

### Swarm Sync Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    COORDINATOR                               │
│   Stores: phase11:pending_sync = ["SMI-432", "SMI-433"...]  │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐          ┌───────────────┐
│  sync-agent-1 │          │  sync-agent-2 │
│  SMI-432-437  │          │  SMI-441-448  │
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
    description: "Sync SMI-432-437",
    prompt: "Update SMI-432,433,434,435,436,437 to Done via GraphQL",
    subagent_type: "general-purpose"
  }),
  Task({
    description: "Sync SMI-441-448",
    prompt: "Update SMI-441,442,443,444,446,447,448 to Done via GraphQL",
    subagent_type: "general-purpose"
  }),
  Task({
    description: "Update project status",
    prompt: "Update project 'Phase 11: Search' to completed state",
    subagent_type: "general-purpose"
  })
]
```

## Verification

Always verify sync completed successfully:

```bash
# Query updated issues
npx ts-node scripts/sync.ts --verify SMI-432,SMI-433,SMI-434 --expected-state Done

# Output:
# ✅ SMI-432: Done
# ✅ SMI-433: Done
# ✅ SMI-434: Done
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
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433 --state Done --verbose

# Output includes:
# [DEBUG] Getting workflow state ID for "Done"
# [DEBUG] State ID: 12911ddd-92bf-41dd-866b-8071290cb250
# [DEBUG] Getting UUIDs for 2 issues
# [DEBUG] Updating SMI-432 (bcbb5f01-8a08-4f25-916c-c8d56f2eb671)
# ✅ SMI-432 → Done
# ...
```

## Common Workflows

### Post-Implementation Sync

After completing a feature:

```bash
# 1. Identify issues from git commits
git log --oneline -10 | grep -oE 'SMI-[0-9]+'

# 2. Bulk update to Done
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

# 3. Update project status
npx ts-node scripts/sync.ts --project "Phase 11" --state completed

# 4. Verify
npx ts-node scripts/sync.ts --verify SMI-432,SMI-433,SMI-434 --expected-state Done
```

### Phase Completion Sync

When closing out a phase:

```bash
# Get all phase issues
npx ts-node scripts/sync.ts --list-project "Phase 11"

# Review which need updating
# ... identify issues still in Backlog/In Progress ...

# Bulk update implemented issues
npx ts-node scripts/sync.ts \
  --issues SMI-432,SMI-433,...,SMI-472 \
  --state Done

# Update project to completed
npx ts-node scripts/sync.ts --project "Phase 11" --state completed
```

### PR Preparation Sync

Before creating a PR:

```bash
# Ensure all referenced issues are updated
npx ts-node scripts/sync.ts \
  --from-branch feature/search-modal \
  --state "In Review"
```

## Reference

- **SKILL.md**: Main Linear skill documentation
- **api.md**: GraphQL API reference
- **sdk.md**: SDK automation patterns
- **scripts/sync.ts**: Sync script implementation
