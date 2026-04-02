# Linear Skill Troubleshooting

Common issues and solutions when working with Linear via MCP, CLI, or API.

---

## MCP Server Issues

### Which MCP Server to Use

**Always use the official Linear MCP server** at `mcp.linear.app`:

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.linear.app/sse"],
      "env": { "LINEAR_API_KEY": "your_api_key" }
    }
  }
}
```

> **WARNING**: Do NOT use deprecated community servers (`linear-mcp-server` npm package, `jerhadf/linear-mcp-server`). They have critical bugs.

---

## Historical: Why Community MCP Servers Failed

> **Note**: These issues are **resolved** with the official Linear MCP server at `mcp.linear.app`. This section is preserved for reference when troubleshooting deprecated community server configurations.

### Issue 1: Status Update Schema Mismatch (FIXED in Official Server)

The deprecated `linear-mcp-server` (npm) had a critical bug:

| Community Server | Official Server |
|------------------|-----------------|
| `status: "Done"` → passed as `stateId` (UUID required) → ❌ Fails | `state: "Done"` → resolved internally → ✅ Works |

**The official server correctly resolves state names to UUIDs internally.**

### Issue 2: SSE Connection Timeouts

Both servers can experience SSE connection drops after extended idle periods. The official server has improved keep-alive handling, but for very long operations, helper scripts remain a reliable fallback.

**Best Practice**: Use the official MCP server for most operations. Fall back to helper scripts for bulk operations or timeout-prone scenarios.

---

## Helper Scripts Overview

When MCP is unavailable or unreliable, use the helper scripts.

### Linear API Wrapper (scripts/linear-api.mjs)

A complete API wrapper with proper JSON escaping and error handling:

```bash
# Create issue (replace <TEAM> with your team key, e.g., ENG, PROJ)
node scripts/linear-api.mjs create-issue \
  --team <TEAM> --title "New feature" --description "Details here" --priority 2

# Update status (replace <TEAM>-123 with your issue identifier)
node scripts/linear-api.mjs update-status \
  --issue <TEAM>-123 --status done

# Add comment
node scripts/linear-api.mjs add-comment \
  --issue <TEAM>-123 --body "Fixed in PR #25"

# Add project update
node scripts/linear-api.mjs add-project-update \
  --project <PROJECT_UUID> --body "## Status Update\n\nProgress details..." --health onTrack

# List issues
node scripts/linear-api.mjs list-issues \
  --team <TEAM> --status "In Progress" --limit 20

# List labels
node scripts/linear-api.mjs list-labels --team <TEAM>

# Help
node scripts/linear-api.mjs help
```

**Benefits over MCP:**
- Proper JSON escaping (no shell parsing issues)
- Reliable status updates (uses correct GraphQL types)
- Batch-friendly for scripting
- Can be imported as ES module for programmatic use

### Quick Comment by Issue Number

Add comments without needing to look up UUIDs:

```bash
# Simple comment (use the issue number, e.g., 123 for PROJ-123)
node scripts/linear-helpers.mjs add-comment 123 "Fixed in PR #25"

# Multi-line comment (use quotes)
node scripts/linear-helpers.mjs add-comment 123 "## Resolved

Implementation complete. All tests passing."
```

**Pattern**: Use MCP for issue creation, helper scripts for status updates and comments, and direct GraphQL for searches and complex queries.

---

## Common Errors

### "MCP tools not available"

This is NOT a blocker. Use the Linear CLI via Bash:

```bash
linear issues view ENG-123
linear issues create --title "Issue title"
linear issues update ENG-123 -s "STATE_ID"
```

### Status Update Fails with Schema Error

If using the official server, use `state: "Done"` (not `status: "Done"`).

If still failing, use the helper script:

```bash
node scripts/linear-helpers.mjs update-status Done 123 124 125
```

### SSE Connection Timeout

For long-running operations, prefer the bulk sync script:

```bash
npm run sync -- --issues PROJ-101,PROJ-102,PROJ-103 --state Done
```

### API Key Not Set

Verify your API key is configured:

```bash
varlock load 2>&1 | grep LINEAR
```

If not set, add to your environment:

```bash
export LINEAR_API_KEY="lin_api_your_key_here"
```

---

## Debugging

### Test Connection

```bash
npm run query -- "query { viewer { name } }"
```

### Check MCP Configuration

Ensure `mcp.linear.app` (not a community server) is configured in your MCP settings.

### View Available States

```bash
npm run query -- 'query { workflowStates(first: 50) { nodes { id name type } } }'
```

---

## See Also

- [api.md](api.md) - GraphQL API reference and timeout handling
- [sync.md](sync.md) - Bulk sync patterns
- [SKILL.md](SKILL.md) - Main skill documentation
