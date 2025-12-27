# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
