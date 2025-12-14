# Linear Skill for Claude Code

A comprehensive Claude Code skill for managing Linear issues, projects, and teams. Provides patterns for MCP tools, SDK automation, and GraphQL API access.

## Features

- **MCP Tool Integration** — Simple operations via Linear MCP server
- **SDK Automation** — Complex operations with TypeScript scripts
- **GraphQL API** — Direct API access for advanced queries
- **Project Management** — Content, descriptions, milestones, resource links
- **Status Management** — Project status UUIDs for workflow automation

## Installation

### Quick Install (Recommended)

```bash
# Clone directly to your skills directory
git clone https://github.com/wrsmith108/linear-claude-skill ~/.claude/skills/linear
```

### Manual Install

1. Download the skill files
2. Copy to `~/.claude/skills/linear/`
3. Restart Claude Code

## Directory Structure

```
linear/
├── SKILL.md          # Main skill instructions
├── api.md            # GraphQL API reference
├── sdk.md            # SDK automation patterns
└── scripts/
    ├── query.ts      # GraphQL query runner
    └── query.sh      # Shell wrapper
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

## Key Patterns

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
See `sdk.md` for TypeScript patterns for loops, filtering, and batch updates.

## Contributing

Contributions welcome! Please submit issues and PRs to improve the skill.

## License

MIT License — See [LICENSE](LICENSE)

## Credits

Created for the Claude Code community. Patterns developed through real-world project management workflows.
