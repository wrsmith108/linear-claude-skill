# Linear Skill for Claude Code

A comprehensive [Claude Code](https://claude.ai/code) skill for managing Linear issues, projects, and teams. Provides patterns for MCP tools, SDK automation, and GraphQL API access.

## Features

- **Discovery Before Creation** — Mandatory checks to prevent duplicate projects/issues
- **MCP Tool Integration** — Simple operations via Linear MCP server
- **SDK Automation** — Complex operations with TypeScript scripts
- **GraphQL API** — Direct API access for advanced queries
- **Project Management** — Content, descriptions, milestones, resource links
- **Status Management** — Project status UUIDs for workflow automation
- **MCP Reliability Workarounds** — Fallback patterns for timeout/failure scenarios
- **Bulk Sync** — Synchronize code changes with Linear via CLI, agents, or hooks

## Installation

### Option A: Claude Plugin (Recommended)

```bash
claude plugin add github:wrsmith108/linear-claude-skill
```

### Option B: Manual Installation

```bash
# Clone directly to your skills directory
git clone https://github.com/wrsmith108/linear-claude-skill ~/.claude/skills/linear
```

## Prerequisites

- **Linear API Key** — Generate at Linear → Settings → Security & access → API
- **Linear MCP Server** — Configure in `.mcp.json`:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "linear-mcp-server"],
      "env": {
        "LINEAR_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Directory Structure

```
skills/linear/
├── SKILL.md          # Main skill instructions
├── api.md            # GraphQL API reference
├── sdk.md            # SDK automation patterns
├── sync.md           # Bulk sync patterns
├── scripts/
│   ├── query.ts      # GraphQL query runner
│   ├── query.sh      # Shell wrapper
│   └── sync.ts       # Bulk sync CLI tool
└── hooks/
    └── post-edit.sh  # Auto-sync hook
```

## Key Patterns

### Discovery Before Creation (Critical!)

**ALWAYS check Linear before creating projects or issues.** This prevents duplicates:

```bash
# Check for existing projects
linear projects list | grep -i "phase\|feature-name"

# Check for existing issues
linear issues list --filter "title:keyword"
```

See `skills/linear/SKILL.md` → "Discovery Before Creation" for the full checklist.

### MCP Reliability (Critical!)

The Linear MCP server has known reliability issues:

| Operation | MCP Reliability | Recommendation |
|-----------|----------------|----------------|
| Create issue | ✅ Reliable | Use MCP |
| Search issues | ⚠️ Times out | Use GraphQL |
| Update status | ⚠️ Unreliable | Use GraphQL |
| Add comment | ❌ Broken | Use GraphQL |

See `skills/linear/SKILL.md` for GraphQL workaround patterns.

### Content vs Description (Critical!)

Linear has TWO text fields — using the wrong one causes blank displays:

| Field | Limit | Shows In |
|-------|-------|----------|
| `description` | 255 chars | List views, tooltips |
| `content` | Unlimited | **Main detail panel** |

Always set BOTH when creating projects.

### Project Status UUIDs

Status UUIDs are **workspace-specific**. Query your workspace:

```graphql
query { projectStatuses { nodes { id name } } }
```

Common statuses: `Backlog`, `Planned`, `In Progress`, `Completed`, `Canceled`

### Resource Links

Add clickable links to projects/initiatives:

```graphql
mutation {
  entityExternalLinkCreate(input: {
    url: "https://github.com/org/repo/docs/phase-1.md",
    label: "Implementation Doc",
    projectId: "<uuid>"
  }) { success }
}
```

### Project Milestones

Track Definition of Done:

```graphql
mutation {
  projectMilestoneCreate(input: {
    projectId: "<uuid>",
    name: "DoD: Testing",
    description: "Unit tests, E2E tests, 100% coverage"
  }) { success }
}
```

## Usage Examples

### Create Issue (MCP)
```
Create a high priority issue titled "Fix authentication bug" in the ENG team
```

### Update Project Status (GraphQL)
```graphql
mutation {
  projectUpdate(id: "<project-uuid>", input: {
    statusId: "<status-uuid>"  # Get from projectStatuses query
  }) { success }
}
```

### Bulk Operations (SDK)
See `skills/linear/sdk.md` for TypeScript patterns for loops, filtering, and batch updates.

### Bulk Sync (NEW)

Synchronize code changes with Linear issues in bulk:

```bash
# Update multiple issues to Done
npx ts-node scripts/sync.ts --issues SMI-432,SMI-433,SMI-434 --state Done

# Update project status after phase completion
npx ts-node scripts/sync.ts --project "Phase 11" --state completed

# Verify sync completed
npx ts-node scripts/sync.ts --verify SMI-432,SMI-433 --expected-state Done
```

#### Agent-Spawned Sync

Spawn a parallel agent for autonomous sync via Task tool:

```javascript
Task({
  description: "Sync Phase 11 to Linear",
  prompt: "Update SMI-432,433,434 to Done. Update project to completed.",
  subagent_type: "general-purpose"
})
```

#### Hook-Triggered Sync

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

See `skills/linear/sync.md` for complete patterns including AgentDB integration.

## Contributing

Contributions welcome! Please submit issues and PRs to improve the skill.

## License

MIT License — See [LICENSE](LICENSE)

## Credits

Created for the Claude Code community. Patterns developed through real-world project management workflows.
