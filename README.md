# Linear Skill for Claude Code

A comprehensive [Claude Code](https://claude.ai/code) skill for managing Linear issues, projects, and teams. Provides patterns for MCP tools, SDK automation, and GraphQL API access.

## Features

- **esbuild Pre-compilation** — 18x faster CLI startup (~50ms vs ~1s) with transparent tsx fallback
- **Label Taxonomy System** — Domain-based labels for consistent categorization and agent routing
- **First-Time Setup Check** — Automatic configuration validation with actionable guidance
- **High-Level Operations** — Simple commands for initiatives, projects, and status updates
- **Sub-Issue Management** — Create and manage parent-child issue relationships
- **Discovery Before Creation** — Mandatory checks to prevent duplicate projects/issues
- **MCP Tool Integration** — Simple operations via Linear MCP server
- **SDK Automation** — Complex operations with TypeScript scripts
- **GraphQL API** — Direct API access for advanced queries
- **Project Management** — Content, descriptions, milestones, resource links
- **Bulk Sync** — Synchronize code changes with Linear via CLI, agents, or hooks
- **Image Uploads** — Upload images to Linear's S3 storage and attach to issues
- **Smoke Tests** — Automated verification of build output and CLI behavior

## Quick Start (New Users)

### 1. Install the Skill

```bash
git clone https://github.com/wrsmith108/linear-claude-skill ~/.claude/skills/linear
cd ~/.claude/skills/linear && npm install
```

### 2. Run Setup Check

```bash
npm run setup
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
npm run ops -- whoami
```

You should see your name and organization.

### 5. Build for Faster Startup (Optional)

```bash
npm run build
```

Pre-compiles TypeScript to JavaScript for ~18x faster CLI cold starts. Without building, commands still work via tsx (slower but functional).

### 6. Start Using It

```bash
# Create an initiative
npm run ops -- create-initiative "My Project"

# Create a project
npm run ops -- create-project "Phase 1" "My Project"

# Create a sub-issue under a parent
npm run ops -- create-sub-issue ENG-100 "Add tests" "Unit tests for feature"

# Set parent-child relationships for existing issues
npm run ops -- set-parent ENG-100 ENG-101 ENG-102

# Update issue status
npm run ops -- status Done ENG-123 ENG-124

# See all commands
npm run ops -- help
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
├── SKILL.md              # Main skill instructions (Claude Code discovers this)
├── api.md                # GraphQL API reference
├── sdk.md                # SDK automation patterns
├── sync.md               # Bulk sync patterns
├── docs/
│   └── labels.md         # Label taxonomy documentation
├── scripts/
│   ├── build.mjs         # esbuild pre-compilation script
│   ├── linear-ops.ts     # High-level operations (issues, projects, labels)
│   ├── query.ts          # GraphQL query runner
│   ├── setup.ts          # Configuration checker
│   ├── sync.ts           # Bulk sync CLI tool
│   ├── upload-image.ts   # Upload images to Linear S3
│   ├── extract-image.ts  # Extract images from session JSONL
│   ├── linear-api.mjs    # Direct API wrapper
│   ├── __tests__/        # Smoke tests (Node built-in test runner)
│   └── lib/              # Shared utilities (taxonomy, labels, verification)
├── dist/                 # Pre-compiled JS output (gitignored, in npm package)
└── hooks/
    └── post-edit.sh      # Auto-sync hook
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
npm run ops -- create-sub-issue <parent> <title> [description] [--priority 1-4] [--labels label1,label2]

# Set existing issues as children of a parent
npm run ops -- set-parent <parent> <child1> <child2> ...

# List all sub-issues of a parent
npm run ops -- list-sub-issues <parent>
```

**When to use sub-issues:**
- Breaking down features into trackable subtasks
- Organizing TDD/E2E test issues under a feature issue
- Sequential phases within a larger initiative

### Label Taxonomy

A standardized label system for consistent issue categorization across projects:

```bash
# Show full taxonomy (25 labels across 3 categories)
npm run ops -- labels taxonomy

# Validate label combinations
npm run ops -- labels validate "feature,security,breaking-change"

# Suggest labels based on issue title
npm run ops -- labels suggest "Fix XSS vulnerability in login form"

# Show agent recommendations for labels
npm run ops -- labels agents "security,performance"
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
npm run ops -- create-project-update "Project Name" "## Update\n\nBody" --health onTrack
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
npx tsx scripts/sync.ts --issues ENG-432,ENG-433,ENG-434 --state Done

# Update project status after phase completion
npx tsx scripts/sync.ts --project "Phase 11" --state completed

# Verify sync completed
npx tsx scripts/sync.ts --verify ENG-432,ENG-433 --expected-state Done
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

### 2.5.0 (2026-03-17)

- Consolidated `requireClient()` to delegate to `getLinearClient()` — single client singleton
- Added smoke tests for build output, CLI behavior, and lazy client initialization
- Documented `__BUNDLED__` build-time define pattern
- Extended esbuild fallback pattern to `upload-image` and `extract-image` scripts
- Bumped SKILL.md version to match package.json

### 2.4.0 (2026-03-04)

- Added esbuild pre-compilation for **18x faster CLI startup** (~50ms vs ~1s)
- Lazy `getLinearClient()` — SDK initialization deferred to first API call
- Transparent fallback: `node dist/X.js || npx tsx scripts/X.ts`
- Removed `import.meta.url` CLI guards from lib files
- `npm run` as canonical invocation form in all documentation
- CI workflow with build verification and smoke tests

### 2.3.0 (2026-02-27)

- Added `scripts/upload-image.ts` and `scripts/extract-image.ts` for image management

See [CHANGELOG.md](CHANGELOG.md) for full version history.

## Contributing

Contributions welcome! Please submit issues and PRs to improve the skill.

## License

MIT License — See [LICENSE](LICENSE)

## Credits

Created for the Claude Code community. Patterns developed through real-world project management workflows.
