# Linear Labels Guide

This skill uses a standardized label taxonomy for consistent issue management across all projects and initiatives.

## For Users

When you ask Claude to create Linear issues, it will automatically apply appropriate labels based on this taxonomy. Labels help:
- Categorize work by technical domain
- Track issue types (features, bugs, etc.)
- Flag special conditions (blocked, breaking changes)
- Route work to appropriate agents

## For Claude Code

When creating, searching, or updating Linear issues, follow this label system.

---

## Label Categories

### Type Labels (exactly one required)

Every issue MUST have exactly one Type label. This defines the nature of the work.

| Label | Use When | Color |
|-------|----------|-------|
| `feature` | Adding new functionality | #A2EEEF |
| `bug` | Fixing broken behavior | #D73A4A |
| `refactor` | Improving code without changing behavior | #D4C5F9 |
| `chore` | Maintenance, deps, tooling | #FEF2C0 |
| `spike` | Research or investigation | #FBCA04 |

### Domain Labels (1-2 recommended)

Domain labels indicate the technical area and enable agent routing. Apply 1-2 labels that best match the work.

| Label | Technical Area | Primary Agents |
|-------|---------------|----------------|
| `security` | Auth, encryption, vulnerabilities | security-manager, byzantine-coordinator |
| `performance` | Speed, latency, optimization | performance-benchmarker, perf-analyzer |
| `infrastructure` | CI/CD, deployment, DevOps | swarm-init, mesh-coordinator |
| `testing` | Tests, coverage, QA | tester, tdd-london-swarm |
| `reliability` | Fault tolerance, consensus | raft-manager, gossip-coordinator |
| `core` | Business logic, core features | coder, sparc-coder |
| `frontend` | UI, React, styling | frontend-dev, ui-designer |
| `backend` | APIs, server, database | backend-dev, api-designer |
| `integration` | Third-party services | integration-specialist |
| `documentation` | Docs, guides | researcher |
| `mcp` | MCP tools and servers | mcp-developer, tool-builder |
| `cli` | Command-line tools | cli-developer |
| `neural` | AI/ML components | safla-neural, collective-intelligence |

### Scope Labels (0-2 optional)

Scope labels flag special conditions. Only apply when relevant.

| Label | Flag When | Color |
|-------|-----------|-------|
| `breaking-change` | Breaks backward compatibility | #B60205 |
| `tech-debt` | Addresses technical debt | #5319E7 |
| `blocked` | Waiting on dependency | #D73A4A |
| `needs-split` | Too large, needs breakdown | #FBCA04 |
| `good-first-issue` | Good for newcomers | #7057FF |
| `enterprise` | Enterprise-tier only | #7057FF |
| `soc2` | Compliance requirement | #0052CC |

---

## Label Selection Decision Tree

When creating an issue, follow this order:

```
1. DETERMINE TYPE (exactly one required)
   Is this...
   - Adding new capability? → feature
   - Fixing broken behavior? → bug
   - Improving without changing behavior? → refactor
   - Updating deps/tooling/config? → chore
   - Researching/investigating? → spike

2. DETERMINE DOMAIN (1-2 labels)
   What technical area(s) does this touch?
   - Auth, encryption, vulnerabilities? → security
   - Speed, latency, benchmarks? → performance
   - CI/CD, deploy, Docker? → infrastructure
   - Tests, coverage, QA? → testing
   - Fault tolerance, consensus? → reliability
   - Business logic, core features? → core
   - UI, React, styling? → frontend
   - APIs, server, database? → backend
   - Third-party APIs? → integration
   - Docs, guides, comments? → documentation
   - MCP tools/servers? → mcp
   - CLI commands? → cli
   - AI/ML models? → neural

3. ADD SCOPE FLAGS (0-2 if applicable)
   - Breaks backward compatibility? → breaking-change
   - Addresses technical debt? → tech-debt
   - Waiting on external dependency? → blocked
   - Too large, needs breakdown? → needs-split
   - Good for onboarding? → good-first-issue
   - Enterprise-tier only? → enterprise
   - Compliance requirement? → soc2
```

---

## Examples

### Security bug fix
```
Labels: bug, security
```

### New API feature
```
Labels: feature, backend, integration
```

### Performance investigation
```
Labels: spike, performance
```

### Breaking refactor with tech debt
```
Labels: refactor, core, breaking-change, tech-debt
```

### Frontend feature with tests
```
Labels: feature, frontend, testing
```

### Infrastructure maintenance
```
Labels: chore, infrastructure
```

---

## Validation Rules

1. **Always** apply exactly ONE Type label
2. **Apply** 1-2 Domain labels for agent routing
3. **Only** add Scope labels when applicable
4. **Never** create new labels - use this taxonomy
5. **Validate** labels before creating issues

---

## CLI Commands

Use `linear-ops.ts` to work with the taxonomy:

```bash
# Show full taxonomy
npm run ops -- labels taxonomy

# Validate a label set
npm run ops -- labels validate "feature,security,breaking-change"

# Suggest labels for an issue title
npm run ops -- labels suggest "Fix XSS vulnerability in login form"

# Show agent recommendations for labels
npm run ops -- labels agents "security,performance"
```

---

## Agent Self-Selection

Domain labels enable agents to self-select work:

1. **Primary agent match takes priority** - If issue has "security" label, security-manager claims first
2. **Multi-label issues route to agent with broadest match** - Agent with most matching domains
3. **Secondary agents as fallback** - If primary agents busy/unavailable
4. **No domain label = general pool** - Issues without domain labels available to any agent

---

## Common Query Patterns

### Find all security issues
```graphql
filter: { labels: { name: { eq: "security" } } }
```

### Find bugs in a domain
```graphql
filter: { labels: { name: { in: ["bug", "security"] } } }
```

### Find blocked work
```graphql
filter: { labels: { name: { eq: "blocked" } } }
```

### Find work needing breakdown
```graphql
filter: { labels: { name: { eq: "needs-split" } } }
```

---

## Programmatic Usage

```typescript
import {
  validateLabels,
  suggestLabels,
  selectAgentsForIssue,
  LABEL_TAXONOMY
} from './lib'

// Validate labels before creating an issue
const validation = validateLabels(['feature', 'security', 'breaking-change'])
if (!validation.valid) {
  console.error('Invalid labels:', validation.errors)
}

// Suggest labels based on title
const suggestions = suggestLabels('Fix XSS vulnerability in login form')
// Returns: [{ label: 'bug', confidence: 0.8 }, { label: 'security', confidence: 0.9 }]

// Get agent recommendations
const agents = selectAgentsForIssue(['security', 'performance'])
// Returns: { primary: ['security-manager'], secondary: ['reviewer', 'tester'] }
```
