# Linear Skill for Claude Code

A comprehensive [Claude Code](https://claude.ai/code) skill for managing Linear issues, projects, and teams. Provides patterns for MCP tools, SDK automation, and GraphQL API access.

## Features

- **Label Taxonomy System** — Domain-based labels for consistent categorization and agent routing
- **First-Time Setup Check** — Automatic configuration validation with actionable guidance
- **High-Level Operations** — Simple commands for initiatives, projects, and status updates
- **Sub-Issue Management** — Create and manage parent-child issue relationships
- **Discovery Before Creation** — Mandatory checks to prevent duplicate projects/issues
- **MCP Tool Integration** — Simple operations via Linear MCP server
- **SDK Automation** — Complex operations with TypeScript scripts
- **GraphQL API** — Direct API access for advanced queries
- **Project Management** — Content, descriptions, milestones, resource links
- **Status Management** — Project status UUIDs for workflow automation
- **MCP Reliability Workarounds** — Fallback patterns for timeout/failure scenarios
- **Bulk Sync** — Synchronize code changes with Linear via CLI, agents, or hooks

## Quick Start (New Users)

### 1. Install the Skill

```bash
git clone https://github.com/wrsmith108/linear-claude-skill ~/.claude/skills/linear
cd ~/.claude/skills/linear && npm install
```

### 2. Run Setup Check

```bash
npx tsx scripts/setup.ts
```

This checks your configuration and tells you exactly what's missing.

### 3. Get Your API Key (If Needed)

1. Open [Linear](https://linear.app) in your browser
2. Go to **Settings** → **Security & access** → **Personal API keys**
3. Click **Create key** and copy it (starts with `lin_api_`)
4. Add to your environment:

```bash
# Add to shell profile
echo 'export LINEAR_API_KEY="lin_api_your_key_here"' >> ~/.zshrc
source ~/.zshrc
```

### 4. Verify It Works

```bash
npx tsx scripts/linear-ops.ts whoami
```

You should see your name and organization.

### 5. Start Using It

```bash
# Create an initiative
npx tsx scripts/linear-ops.ts create-initiative "My Project"

# Create a project
npx tsx scripts/linear-ops.ts create-project "Phase 1" "My Project"

# Create a sub-issue under a parent
npx tsx scripts/linear-ops.ts create-sub-issue ENG-100 "Add tests" "Unit tests for feature"

# Set parent-child relationships for existing issues
npx tsx scripts/linear-ops.ts set-parent ENG-100 ENG-101 ENG-102

# Update issue status
node scripts/linear-helpers.mjs update-status Done 123 124

# See all commands
npx tsx scripts/linear-ops.ts help
```

---

## Installation

```bash
# Clone directly to your skills directory
git clone https://github.com/wrsmith108/linear-claude-skill ~/.claude/skills/linear
cd ~/.claude/skills/linear && npm install
```

## Prerequisites

- **Linear API Key** — Generate at Linear → Settings → Security & access → Personal API keys
- **Linear MCP Server** (Recommended) — Use the **official Linear MCP server** for best reliability:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.linear.app/sse"],
      "env": {
        "LINEAR_API_KEY": "your_api_key"
      }
    }
  }
}
```

> **Important**: Always use Linear's official MCP server at `mcp.linear.app`. Do NOT use deprecated community servers like `linear-mcp-server` (npm) or `jerhadf/linear-mcp-server` (GitHub).

## Directory Structure

```
linear-claude-skill/
├── SKILL.md          # Main skill instructions (Claude Code discovers this)
├── api.md            # GraphQL API reference
├── sdk.md            # SDK automation patterns
├── sync.md           # Bulk sync patterns
├── docs/
│   └── labels.md     # Label taxonomy documentation
├── scripts/
│   ├── linear-ops.ts # High-level operations (issues, projects, labels)
│   ├── query.ts      # GraphQL query runner
│   ├── setup.ts      # Configuration checker
│   ├── sync.ts       # Bulk sync CLI tool
│   ├── linear-api.mjs # Direct API wrapper
│   └── lib/          # Shared utilities (taxonomy, labels, verification)
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

See `SKILL.md` → "Discovery Before Creation" for the full checklist.

### Codebase Verification Before Work (Critical!)

**ALWAYS verify codebase state before accepting issue scope at face value.**

Issue descriptions may be outdated or speculative. APIs or features may already be implemented!

```bash
# Before starting "implement API" issues:
ls src/pages/api/admin/members/     # Check if files exist
grep -r "test.skip" tests/          # Check if tests are just skipped
```

**Key Lesson**: Issues describing "missing" features may already be implemented. The real work is often un-skipping tests and fixing assertions, not reimplementing.

See `SKILL.md` → "Codebase Verification Before Work" for the full checklist.

### MCP Reliability (Critical!)

The Linear MCP server has known reliability issues (34% timeout rate due to SSE idle timeouts):

| Operation | MCP Reliability | Recommendation |
|-----------|----------------|----------------|
| Create issue | ✅ Reliable | Use MCP |
| Search issues | ⚠️ Times out | Use GraphQL |
| Update status | ⚠️ Unreliable | Use GraphQL |
| Add comment | ❌ Broken | Use GraphQL |

See `SKILL.md` for GraphQL workaround patterns and root cause explanation.

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

### Sub-Issue Management

Organize issues into parent-child hierarchies for better tracking:

```bash
# Create a sub-issue under a parent issue
# Inherits team and project from parent automatically
npx tsx scripts/linear-ops.ts create-sub-issue <parent> <title> [description] [--priority 1-4] [--labels label1,label2]

# Set existing issues as children of a parent
npx tsx scripts/linear-ops.ts set-parent <parent> <child1> <child2> ...

# List all sub-issues of a parent
npx tsx scripts/linear-ops.ts list-sub-issues <parent>
```

**When to use sub-issues:**
- Breaking down features into trackable subtasks
- Organizing TDD/E2E test issues under a feature issue
- Sequential phases within a larger initiative

### Label Taxonomy

A standardized label system for consistent issue categorization across projects:

```bash
# Show full taxonomy (25 labels across 3 categories)
npx tsx scripts/linear-ops.ts labels taxonomy

# Validate label combinations
npx tsx scripts/linear-ops.ts labels validate "feature,security,breaking-change"

# Suggest labels based on issue title
npx tsx scripts/linear-ops.ts labels suggest "Fix XSS vulnerability in login form"

# Show agent recommendations for labels
npx tsx scripts/linear-ops.ts labels agents "security,performance"
```

**Label Categories:**
- **Type** (exactly one required): `feature`, `bug`, `refactor`, `chore`, `spike`
- **Domain** (1-2 recommended): `security`, `backend`, `frontend`, `testing`, `infrastructure`, `mcp`, `cli`, etc.
- **Scope** (0-2 optional): `blocked`, `breaking-change`, `tech-debt`, `needs-split`, `good-first-issue`

See `docs/labels.md` for the complete taxonomy guide.

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

### Project Updates (Status Reports)

Post status updates to a project's Updates tab:

```bash
# Using SDK script (recommended)
LINEAR_API_KEY=lin_api_xxx npx tsx scripts/create-project-update.ts "Project Name" "## Update\n\nBody" onTrack
```

Health options: `onTrack`, `atRisk`, `offTrack`

See `SKILL.md` for full documentation and GraphQL examples.

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

### Bulk Sync (NEW)

Synchronize code changes with Linear issues in bulk:

```bash
# Update multiple issues to Done
npx ts-node scripts/sync.ts --issues ENG-432,ENG-433,ENG-434 --state Done

# Update project status after phase completion
npx ts-node scripts/sync.ts --project "Phase 11" --state completed

# Verify sync completed
npx ts-node scripts/sync.ts --verify ENG-432,ENG-433 --expected-state Done
```

#### Agent-Spawned Sync

Spawn a parallel agent for autonomous sync via Task tool:

```javascript
Task({
  description: "Sync Phase 11 to Linear",
  prompt: "Update ENG-432,433,434 to Done. Update project to completed.",
  subagent_type: "Linear-specialist"
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

See `sync.md` for complete patterns including AgentDB integration.

## Changelog

### 2.2.3 (2026-02-10)

- Added Varlock environment schema for secure secret management
- Completed cross-skill hardcoded path audit across 9 repos

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Contributing

Contributions welcome! Please submit issues and PRs to improve the skill.

## License

MIT License — See [LICENSE](LICENSE)

## Credits

Created for the Claude Code community. Patterns developed through real-world project management workflows.
