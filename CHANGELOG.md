## [2.2.3] - 2026-02-10

### Changed
- Added Varlock environment schema for secure secret management
- Completed cross-skill hardcoded path audit across 9 repos (SMI-2426 through SMI-2435)
- Updated README with changelog section

## [2.2.2](https://github.com/wrsmith108/linear-claude-skill/compare/v2.2.1...v2.2.2) (2026-02-10)


### Bug Fixes

* replace hardcoded ~/.claude/skills/linear paths with relative paths ([7ca519c](https://github.com/wrsmith108/linear-claude-skill/commit/7ca519cf949b78c92dffc1f049fd8282a8369bd5)), closes [#8](https://github.com/wrsmith108/linear-claude-skill/issues/8)

## [2.2.1](https://github.com/wrsmith108/linear-claude-skill/compare/v2.2.0...v2.2.1) (2026-02-10)


### Bug Fixes

* replace hardcoded ~/.claude/skills/linear paths with relative paths ([19819d3](https://github.com/wrsmith108/linear-claude-skill/commit/19819d35083737fcbdb26c432c9f11ecce8e9cba)), closes [#8](https://github.com/wrsmith108/linear-claude-skill/issues/8)

# [2.2.0](https://github.com/wrsmith108/linear-claude-skill/compare/v2.1.1...v2.2.0) (2026-01-24)


### Bug Fixes

* use Node 22 for semantic-release compatibility ([02b5b79](https://github.com/wrsmith108/linear-claude-skill/commit/02b5b79e64d19ed6a86b93464a0fc7afc54cf7d2))


### Features

* add semantic-release for automated versioning ([bd4c77b](https://github.com/wrsmith108/linear-claude-skill/commit/bd4c77bb813dfaea749924bfb9efd0f23d111516))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2026-01-24

### Added
- **CI/CD Workflows** - GitHub Actions for automated validation and releases
  - CI workflow runs TypeScript type checking and ESLint on push/PR to main
  - Release workflow automatically creates GitHub releases from version tags
  - Added `typecheck`, `lint`, `lint:fix` npm scripts

### Fixed
- **TypeScript compatibility** - Fixed type errors for Linear SDK v68
  - Updated health type usage to use SDK enums
  - Fixed `rawRequest` generic types
  - Converted `require.main` checks to ES module syntax
  - Added `@types/node` for Node.js globals

---

## [2.1.0] - 2026-01-23

### Added
- **Parallel Agent Execution** - New `Linear-specialist` subagent for background operations (SMI-1572)
  - Dedicated subagent at `~/.claude/agents/Linear-specialist.md`
  - Delegation guidance in SKILL.md (when to use parallel vs direct)
  - Updated Task examples in `sync.md` and `README.md`

### Fixed
- **Generalization cleanup** - Removed remaining project-specific references for public distribution
  - Changed "Skillsmith" to generic "My Initiative" or "Q1 Goals" in examples
  - Changed `SMI-` issue prefixes to generic `ENG-` in all documentation
  - Updated CHANGELOG to remove internal script names and project references

---

## [2.0.0] - 2026-01-18

### BREAKING CHANGES
- **Restructured for Claude Code Skill Discovery** - Moved all files to root level
  - `SKILL.md` now at repository root (was `skills/linear/SKILL.md`)
  - `scripts/` now at root (was `skills/linear/scripts/`)
  - `docs/` now at root (was `skills/linear/docs/`)
  - `hooks/` now at root (was `skills/linear/hooks/`)
  - `api.md`, `sdk.md`, `sync.md` now at root level

### Fixed
- **Skill Not Discovered** - Claude Code scans `~/.claude/skills/<name>/SKILL.md` but the nested structure prevented discovery (Fixes #5)

### Changed
- **package.json** - Updated `files` array and `scripts` paths for flat structure
- **claude-plugin.skills** - Changed from `["skills/linear"]` to `["."]`
- **All path references** - Updated in SKILL.md, README.md, and documentation

### Migration
Users who cloned the repo should `git pull` - the skill will be automatically discovered on next Claude Code session.

For fresh installs:
```bash
git clone https://github.com/wrsmith108/linear-claude-skill.git ~/.claude/skills/linear
cd ~/.claude/skills/linear && npm install
```

---

## [1.7.1] - 2026-01-18

### Fixed
- **Plugin Installation Command** - Corrected installation command in README documentation

---

## [1.7.0] - 2026-01-16

### Added
- **Label Taxonomy System** - Domain-based labels for consistent issue categorization
  - 25 labels across 3 categories: Type (5), Domain (13), Scope (7)
  - `taxonomy.ts` - TypeScript interfaces for labels, categories, and agents
  - `taxonomy-data.ts` - Complete label definitions with colors, descriptions, agent mappings
  - `taxonomy-validation.ts` - Validation rules and keyword-based label suggestion
  - `agent-selection.ts` - Agent routing based on domain labels for self-selection

- **Label CLI Commands** - New `labels` subcommands in `linear-ops.ts`
  - `labels taxonomy` - Display full taxonomy with colors and agent mappings
  - `labels validate <labels>` - Validate label combinations against taxonomy rules
  - `labels suggest <title>` - Suggest labels based on issue title keywords
  - `labels agents <labels>` - Show primary/secondary agent recommendations

- **Label Documentation** - `docs/labels.md` with complete taxonomy guide
  - Label selection decision tree
  - Common query patterns for filtering by labels
  - Programmatic usage examples

### Changed
- **labels.ts** - Integrated taxonomy colors and added validation option to `ensureLabelsExist()`
- **index.ts** - Added exports for all taxonomy utilities
- **SKILL.md** - Added Labels section referencing taxonomy documentation
- **README.md** - Added Label Taxonomy to features and Key Patterns sections

### Label Categories
| Category | Labels | Required |
|----------|--------|----------|
| Type | `feature`, `bug`, `refactor`, `chore`, `spike` | Exactly 1 |
| Domain | `security`, `performance`, `infrastructure`, `testing`, `reliability`, `core`, `frontend`, `backend`, `integration`, `documentation`, `mcp`, `cli`, `neural` | 1-2 recommended |
| Scope | `breaking-change`, `tech-debt`, `blocked`, `needs-split`, `good-first-issue`, `enterprise`, `soc2` | 0-2 optional |

---

## [1.6.1] - 2026-01-12

### Removed
- **8 obsolete scripts** - Cleaned up one-off phase-specific scripts (3,006 lines removed)
  - `create-phase5-issues.ts`, `create-phase6-issues.ts` - Phase-specific issue creation
  - `create-next-steps.ts` - Phase 2i/2j planning script
  - `update-phase7-deps.ts` - One-off dependency fix
  - `fix-project-structure.ts`, `fix-project-structure-v2.ts` - Structure fixes
  - `update-status.ts` - Redundant with `sync.ts`
  - `verify-linear-structure.ts` - Hardcoded debugging script

### Changed
- **Generalized for public use** - Removed project-specific references
  - Changed `SMI-` examples to generic `ENG-` in documentation and scripts
  - Removed `phase-5`, `phase-6`, `phase-7` label colors from `lib/labels.ts`
  - Examples now use generic team prefixes for broader applicability

### Retained Scripts (10 + 7 lib files)
- Core CLI: `linear-ops.ts`, `linear-api.mjs`, `query.ts`, `query.sh`
- Utilities: `setup.ts`, `sync.ts`, `phase-complete.ts`
- Updates: `create-initiative-update.ts`, `create-project-update.ts`, `create-issue-with-project.ts`
- Lib: All shared utilities retained

---

## [1.6.0] - 2026-01-11

### Added
- **Project State Management** - New `project-status` command for updating project states
  - Supports all Linear project states: backlog, planned, in-progress, paused, completed, canceled
  - Uses user-friendly terminology (`in-progress`) that maps to Linear API values (`started`)
  - Partial project name matching for convenience

- **Initiative Linking** - New commands for managing project-initiative relationships
  - `link-initiative` - Connect a project to an initiative
  - `unlink-initiative` - Remove a project from an initiative
  - Both support partial name matching for projects and initiatives

- **Project Planning Workflow** - New documentation section with best practices
  - Complete project lifecycle example from creation to completion
  - Anti-pattern guidance to avoid common mistakes
  - Step-by-step workflow for creating issues in the correct project

### Improved
- **Documentation** - Comprehensive command reference with examples
  - Valid states table showing input → API value mapping
  - Error handling notes for each command
  - Real-world examples for project phases and initiatives

---

## [1.5.0] - 2025-12-28

### Changed
- **BREAKING: Official MCP Server Required** - Migrated to Linear's official MCP server at `mcp.linear.app`
  - Deprecated community servers (`linear-mcp-server` npm, `jerhadf/linear-mcp-server`) are no longer supported
  - Use `npx mcp-remote https://mcp.linear.app/sse` for MCP configuration
  - Official server supports OAuth 2.1 authentication

### Fixed
- **Status Updates Now Work with Names** - The official server resolves `state: "Done"` to UUIDs internally
  - No longer need to manually lookup workflow state UUIDs
  - `update_issue` with `state: "In Progress"` works directly
  - Eliminated the schema mismatch bug where `status` was passed as `stateId`

### Improved
- **MCP Reliability Matrix** - Updated to reflect official server improvements
  - Status updates: ❌ Unreliable → ✅ Works with names
  - Search operations: ⚠️ Times out → ✅ High reliability
  - All operations now recommended via MCP first (was GraphQL-first)
- **Tool Selection Guidance** - MCP is now preferred for most operations
- **Documentation** - Added clear warnings against deprecated community servers

### Migration Guide
1. Update MCP configuration from `npx -y linear-mcp-server` to `npx mcp-remote https://mcp.linear.app/sse`
2. Change `status` parameter to `state` in update calls (official server uses `state`)
3. Use human-readable state names directly: `state: "Done"` instead of UUID lookups

---

## [1.4.0] - 2025-12-26

### Added
- **First-Time Setup Experience** - Complete onboarding flow for new users
  - `scripts/setup.ts` - Comprehensive setup check and diagnostics
    - Validates LINEAR_API_KEY presence and format
    - Tests API connection and shows authenticated user
    - Checks @linear/sdk installation
    - Detects Linear CLI and MCP configuration
    - Provides actionable fix instructions for each issue
  - `scripts/linear-ops.ts` - High-level operations without API knowledge
    - `create-initiative` - Create initiatives with simple command
    - `create-project` - Create projects linked to initiatives
    - `status` - Update multiple issues at once
    - `list-initiatives` / `list-projects` - Browse workspace
    - `whoami` - Show current user and organization
    - `setup` - Run setup check
    - `help` - Show all available commands

### Changed
- **SKILL.md** - Added "Quick Start (First-Time Users)" section at top
- **README.md** - Added "Quick Start (New Users)" section with step-by-step guide
- **query.ts** - Improved error messages with actionable setup instructions
- **package.json** - Added npm scripts:
  - `postinstall` - Runs setup check silently after install
  - `setup` - Run full setup diagnostics
  - `ops` - Run high-level operations
  - `query` - Run GraphQL queries
  - `test-connection` - Quick API connection test

### Lesson Learned
First-time users need immediate feedback on missing configuration. The setup script now provides clear, actionable instructions for each missing component (API key, SDK, CLI, MCP).

---

## [1.3.0] - 2025-12-24

### Changed
- **API-First for High-Frequency Operations** - Updated tool selection to prefer helper scripts over MCP for status updates and comments
  - Status updates now explicitly recommend `update-status` helper (MCP fails ~50%)
  - Added `add-comment` command to helper script for comments by issue number
  - Updated reliability matrix to show MCP as "❌ Unreliable" for status updates
  - Clearer "Quick Status Update" and "Quick Comment" sections with examples

### Added
- `add-comment <issueNumber> "<body>"` command in `linear-helpers.mjs`
- Multi-line comment support in helper script

### Lesson Learned
MCP's `linear_update_issue` frequently fails with schema validation errors. Direct GraphQL via helper scripts is 100% reliable and should be the primary method for status updates.

---

## [1.2.0] - 2025-12-23

### Added
- **Codebase Verification Before Work** - MANDATORY pattern for verifying codebase state before accepting Linear issue scope
  - Checklist for checking if APIs/features already exist
  - Pattern for detecting skipped tests vs missing implementations
  - Example workflow showing scope discovery
  - Guidance on updating Linear when scope changes
- This pattern prevents wasted effort reimplementing already-complete features

### Lesson Learned
Issues describing "missing" APIs or features may already be implemented. Always verify codebase state before starting work.

---

## [1.1.0] - 2025-12-21

### Added
- **Sync Patterns** - Bulk synchronization of code changes to Linear
  - `sync.md` - Complete documentation for sync workflows
  - `scripts/sync.ts` - CLI tool for bulk issue/project updates
  - `hooks/post-edit.sh` - Auto-trigger hook for code changes
- **Agent-Spawned Sync** - Pattern for spawning parallel sync agents via Task tool
- **AgentDB Integration** - Swarm coordination patterns with memory namespaces
- **Verification Commands** - Confirm sync completed successfully

### Features
- Bulk update multiple issues to target state
- Update project status after phase completion
- Hook-triggered sync suggestions after code edits
- Parallel agent spawning for large batches
- Verbose mode for debugging sync operations

---

## [1.0.1] - 2025-12-20

### Added
- **MANDATORY: Project Content & Updates** section
  - Explicit checklist for project creation operations
  - Required steps for status updates
  - Required steps for work completion
  - Example code for creating project updates

### Changed
- Elevated project update requirements from optional to mandatory
- Clarified that project content and description must always be set together

---

## [1.0.0] - 2025-12-20

### Added
- Initial release as Claude Code marketplace plugin
- MCP tool integration with reliability matrix
- GraphQL API fallback patterns for timeout scenarios
- SDK automation patterns for complex operations
- Project management workflows (content, descriptions, milestones)
- Discovery-before-creation mandatory checks
- Project status management with UUID references
- Resource link and milestone creation patterns
- Project update/status report functionality
- Scripts for ad-hoc GraphQL queries

### Documentation
- Complete SKILL.md with tool selection guidance
- API reference (api.md) for GraphQL operations
- SDK patterns (sdk.md) for TypeScript automation
- Query scripts for direct API access
