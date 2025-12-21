#!/bin/bash
# Linear Sync - Post-Edit Hook
#
# Detects Linear issue references in changed files and suggests sync.
# Install by adding to .claude/settings.json:
#
# {
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "Write|Edit",
#       "hooks": [{
#         "type": "command",
#         "command": "bash ~/.claude/skills/linear/hooks/post-edit.sh"
#       }]
#     }]
#   }
# }

set -e

# Read hook input from stdin (JSON with tool_name, tool_input, etc.)
input=$(cat 2>/dev/null || echo "{}")

# Extract file path from tool input
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || echo "")

# Exit early if no file path
if [ -z "$file_path" ]; then
  exit 0
fi

# Only process source code files
if [[ ! "$file_path" =~ \.(ts|tsx|js|jsx|astro|py|go|rs|md)$ ]]; then
  exit 0
fi

# Skip test files and config
if [[ "$file_path" == *".test."* ]] || [[ "$file_path" == *".spec."* ]]; then
  exit 0
fi
if [[ "$file_path" == *"/test/"* ]] || [[ "$file_path" == *"/tests/"* ]]; then
  exit 0
fi
if [[ "$file_path" == *".config."* ]] || [[ "$file_path" == *"config/"* ]]; then
  exit 0
fi

# Skip node_modules, build artifacts, and generated files
if [[ "$file_path" == *"node_modules"* ]]; then
  exit 0
fi
if [[ "$file_path" == *"/dist/"* ]] || [[ "$file_path" == *"/.vercel/"* ]]; then
  exit 0
fi
if [[ "$file_path" == *"/build/"* ]] || [[ "$file_path" == *"/.next/"* ]]; then
  exit 0
fi

# Extract just the filename for display
filename="${file_path##*/}"

# Check for Linear issue references in the file (SMI-123, ENG-456, etc.)
issue_refs=""
if [ -f "$file_path" ]; then
  # Match common Linear issue patterns: XXX-123
  issue_refs=$(grep -oE '[A-Z]{2,5}-[0-9]+' "$file_path" 2>/dev/null | sort -u | head -10 | tr '\n' ' ' || echo "")
fi

# Also check recent git commits for issue references
recent_issues=""
if command -v git &> /dev/null; then
  recent_issues=$(git log --oneline -5 2>/dev/null | grep -oE '[A-Z]{2,5}-[0-9]+' | sort -u | head -5 | tr '\n' ' ' || echo "")
fi

# Combine and deduplicate
all_issues=$(echo "$issue_refs $recent_issues" | tr ' ' '\n' | sort -u | grep -v '^$' | tr '\n' ' ')

# Output context for Claude (this gets added to the conversation)
if [ -n "$all_issues" ]; then
  echo "[linear-sync] Changed: $filename | Issues: $all_issues"
  echo "[linear-sync] Consider running: npx ts-node ~/.claude/skills/linear/scripts/sync.ts --issues ${all_issues// /,} --state Done"
fi

exit 0
