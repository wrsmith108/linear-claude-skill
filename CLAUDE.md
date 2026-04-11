# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Claude Code skill for managing Linear issues, projects, and teams. It provides high-level TypeScript operations, a label taxonomy system for consistent categorization, and utilities for SDK automation.

## Common Commands

```bash
# Run setup check (validates LINEAR_API_KEY and dependencies)
npm run setup

# High-level operations CLI
npm run ops -- <command> [args]
npm run ops -- help                          # Show all commands
npm run ops -- create-issue "Project" "Title" "Desc"
npm run ops -- create-sub-issue ENG-100 "Title"
npm run ops -- labels taxonomy               # Show label taxonomy
npm run ops -- labels validate "feature,security"

# Run GraphQL query
npm run query -- "query { viewer { name } }"

# Test Linear connection
npm run test-connection
```

## Architecture

### Directory Structure

```
linear-claude-skill/
├── SKILL.md              # Main skill instructions (loaded by Claude Code)
├── api.md                # GraphQL API reference
├── sdk.md                # SDK automation patterns
├── sync.md               # Bulk sync patterns
├── docs/
│   └── labels.md         # Label taxonomy documentation
├── hooks/
│   └── post-edit.sh      # Auto-sync hook
├── scripts/
│   ├── run.sh            # Shared runner (dist/ with tsx fallback)
│   ├── linear-ops.ts     # CLI for high-level operations (main entry point)
│   ├── query.ts          # GraphQL query runner
│   ├── setup.ts          # Configuration validator
│   ├── sync.ts           # Bulk sync operations
│   ├── linear-api.mjs    # Direct API wrapper
│   └── lib/              # Shared utilities (imported by scripts)
│       ├── index.ts      # Re-exports all utilities
│       ├── labels.ts     # Label management (CRUD, validation)
│       ├── taxonomy*.ts  # Label taxonomy system (types, data, validation)
│       ├── agent-selection.ts  # Agent routing based on labels
│       ├── initiative.ts # Initiative linking
│       ├── lin-cli.ts    # Optional lin CLI integration (tryLin, detection, typed wrappers)
│       ├── project-template.ts # Project creation with verification
│       └── verify.ts     # Post-creation verification
```

### Key Components

**linear-ops.ts** — Main CLI entry point. Dispatches to command handlers for issues, projects, initiatives, and labels. All commands follow the pattern:
```typescript
const commands: Record<string, (...args: string[]) => Promise<void>> = { ... }
```

**lib/index.ts** — Central export hub. All scripts import from `./lib` not individual files.

**Label Taxonomy System** — Four files work together:
- `taxonomy.ts`: TypeScript interfaces (DomainLabel, TypeLabel, ScopeLabel, AgentId)
- `taxonomy-data.ts`: Label definitions with colors, descriptions, agent mappings
- `taxonomy-validation.ts`: Validation rules and keyword-based suggestion
- `agent-selection.ts`: Routes issues to agents based on domain labels

**lin-cli.ts** — Optional integration with the `lin` Rust CLI binary. Provides
`isLinCliAvailable()` detection (cached) and `tryLin()` — the single abstraction
used by command handlers for silent fast-path with SDK fallback. Includes typed
wrappers, circuit-breaker after 3 failures, and `LINEAR_USE_LIN=0` kill switch.

**project-template.ts** — Enforces the 6-step project creation workflow:
1. Create project with description
2. Link to initiative (mandatory)
3. Set content via projectUpdate mutation
4. Ensure labels exist
5. Create issues with labels
6. Run verification

### Build System (esbuild)

All TypeScript entry points in `scripts/` are pre-compiled to `dist/` using esbuild for faster CLI startup (eliminates tsx runtime compilation overhead).

**`scripts/build.mjs`** auto-discovers every `scripts/*.ts` file and bundles each one to `dist/*.js`. External dependencies (`@linear/sdk`) are kept external — not inlined into the bundle.

**`__BUNDLED__` build-time define**: The `linear-ops.ts` entry point declares `__BUNDLED__` as a global. At build time, esbuild replaces all occurrences with `true`. This lets code detect whether it is running from a pre-built bundle or via tsx at development time.

**Shared runner (`scripts/run.sh`)**: All npm scripts delegate to a single shell script that checks for the pre-built `dist/*.js` file first, falling back to `npx tsx` if dist is missing:
```
"ops": "sh scripts/run.sh linear-ops"
```

**Key commands:**
- `npm run build` — Run esbuild (also runs `typecheck` via `prebuild`)
- `npm test` — Run smoke tests that validate build output
- `npx tsc --noEmit` — Type-check without emitting files

### Environment Variables

```
LINEAR_API_KEY              # Required - Linear API key (lin_api_...)
LINEAR_DEFAULT_INITIATIVE_ID # Optional - Default initiative for createProjectWithDefaults()
LINEAR_USE_LIN              # Optional - Set to 0 to disable lin CLI fast-path
```

### Label Taxonomy Rules

When creating issues, apply labels in this order:
1. **Type** (exactly one): `feature`, `bug`, `refactor`, `chore`, `spike`
2. **Domain** (1-2): `security`, `backend`, `frontend`, `testing`, `infrastructure`, etc.
3. **Scope** (0-2 if applicable): `blocked`, `breaking-change`, `tech-debt`, etc.

Use `npm run ops -- labels validate "..."` to check label combinations.

### Linear API Patterns

- Use `@linear/sdk` for typed operations (imported as `LinearClient`)
- GraphQL mutations via `fetch('https://api.linear.app/graphql', ...)` for operations not in SDK
- Content vs Description: `description` is 255 chars for list views; `content` is unlimited for detail panel
- Project status requires UUID lookup: `query { projectStatuses { nodes { id name } } }`
- Initiative linking uses `initiativeToProjectCreate` mutation (not SDK method)

### MCP Considerations

The skill is designed to work with Linear's official MCP server at `mcp.linear.app`. Helper scripts provide fallbacks for unreliable MCP operations (status updates, comments).
