# Issue Description Template

> **How to use:** Copy the skeleton below into the `description` argument of `create-issue` / `create-sub-issue`, or run `npm run ops -- create-issue --template` to get the same text on stdout. Fill in every section before submitting; empty checkboxes fail validation.
>
> **Default to detail.** The skeleton has six sections. Use all six unless the user asked for brevity ("quick issue", "one-liner", "just the AC", "brief", "terse", "minimum", "short"). The validator enforces a floor (120-char body, 2+ AC items); reviewers want the full shape. When in doubt, write more — see the [Full example](#full-example) below for what "earned depth" looks like.

---

## Context
**Title:** <to fill>

<What is changing and why. 2-4 sentences. Link prior issues, docs, or incidents that motivate this.>

## Problem
<What specifically is broken, missing, or insufficient today. Name the file, flow, or behavior.>

## Proposal
<What you intend to do about it. High-level approach, not implementation line-by-line.>

## Acceptance Criteria
- [ ] <Concrete, testable outcome>
- [ ] <Concrete, testable outcome>

## Verification
<How the AC will actually be checked. Manual steps, test command, or review instruction.>

## Out of Scope
- <What this issue does NOT cover — redirect to the follow-up or explain why it's deferred>

---

## Full example

A real-shaped issue body, every section populated, nothing ceremonial. This is the depth bar — match it when drafting. The block below is what the `description` argument should look like verbatim (minus the code-fence wrapper).

**Title:** Cache Linear label list in memory to avoid re-fetching on every `labels validate` call

````markdown
## Context
`labels validate` is invoked from `create-issue` (`scripts/linear-ops.ts:135`) on every issue creation. It re-fetches the full label list from Linear on each call — ~400ms round-trip. For batch scripts creating 10+ issues in a loop, that's 4+ seconds of avoidable latency, and it's the dominant cost now that the `lin` CLI fast-path handles the cheap cases.

## Problem
`scripts/lib/labels.ts:fetchAllLabels()` has no caching. Each caller gets a fresh network fetch even when the label set hasn't changed within the process lifetime. No in-memory map, no module-level singleton, no short-lived cache.

## Proposal
Add an in-memory cache to `fetchAllLabels()` keyed by workspace ID (derived from the SDK client). Cache TTL is the process lifetime — no invalidation needed, because new labels appearing mid-batch isn't a realistic case for CLI scripts. Fall through to the network on cache miss; populate the cache on success only (do not cache failures).

## Acceptance Criteria
- [ ] `fetchAllLabels()` makes at most one network call per process for a given workspace
- [ ] A new test in `scripts/__tests__/labels.test.ts` spies on the fetcher and asserts call count ≤ 1 across 3 consecutive `validate` invocations
- [ ] No change to `fetchAllLabels()` signature — all call sites remain identical
- [ ] `LINEAR_DISABLE_LABEL_CACHE=1` env var escape hatch restores fetch-every-call behavior

## Verification
```bash
npm run build && npm test
# then, with a valid LINEAR_API_KEY:
time npm run ops -- labels validate "feature,backend"   # run 3 times back-to-back
# First run: ~400ms (network). Runs 2-3: <50ms each (cached).
LINEAR_DISABLE_LABEL_CACHE=1 npm run ops -- labels validate "feature,backend"
# Should re-fetch, ~400ms again.
```

## Out of Scope
- Persisting the cache across process invocations (filesystem or Redis) — follow-up if batch latency is still problematic
- Invalidation on label CRUD mutations within the same process — assumed rare; if it bites someone, add a clear-on-mutate hook then
- Caching the project or team lists — same pattern applies but track separately
````

---

## Validation rules

Issues created through the Linear skill CLI (and MCP `save_issue` calls made by Claude) must satisfy:

1. Non-empty description after trim.
2. At least **120 characters** of body text, excluding heading lines.
3. An `Acceptance Criteria` heading (H1–H6 accepted).
4. At least **2** bulleted items under that heading that are not placeholder text (e.g. `- [ ] <criterion>`, `- [ ] TODO` all count as zero).

Warnings (don't block):

- No `## Context` / `## Why` / `## Background` heading.
- All acceptance-criteria items under 10 characters.

The validator is a **floor**, not a target. `Problem`, `Proposal`, and `Verification` are not mechanically enforced — they're strongly recommended by the depth rule in `SKILL.md`. Reviewers read for them; skipping them means the issue reads as "just passed validation" rather than "ready to build against."

## Escape hatches

- **Per-invocation**: `--strict=false` flag downgrades validation to a warning for that single run.
- **Global**: `LINEAR_REQUIRE_ACCEPTANCE_CRITERIA=0` environment variable downgrades for the whole session.
- The flag wins when both are set (explicit user intent beats ops kill switch).

## Bug reports and "Steps to Reproduce"

If your issue is a bug report and you prefer `## Steps to Reproduce` over `## Proposal`, include both — `Steps to Reproduce` under `## Context` or `## Problem`, and the AC section lists the fixed-behavior assertions (e.g. `- [ ] Login succeeds for valid credentials`). The validator only checks for the presence of `Acceptance Criteria`; other sections are free-form.
