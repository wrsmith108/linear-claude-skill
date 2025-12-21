# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
