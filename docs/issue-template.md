# Issue Description Template

> **How to use:** Copy this entire file into the `description` argument of `create-issue` / `create-sub-issue`, or run `npm run ops -- create-issue --template` to get the same text on stdout. Fill in every section before submitting; empty checkboxes fail validation.

---

## Context
**Title:** <to fill>

<What is changing and why. 1-3 sentences.>

## Acceptance Criteria
- [ ] <Concrete, testable outcome>
- [ ] <Concrete, testable outcome>

## Out of Scope
- <Optional: what this issue does NOT cover>

## Notes
<Optional: links, references, screenshots>

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

## Escape hatches

- **Per-invocation**: `--strict=false` flag downgrades validation to a warning for that single run.
- **Global**: `LINEAR_REQUIRE_ACCEPTANCE_CRITERIA=0` environment variable downgrades for the whole session.
- The flag wins when both are set (explicit user intent beats ops kill switch).

## Bug reports and "Steps to Reproduce"

If your issue is a bug report and you prefer `## Steps to Reproduce` over `## Acceptance Criteria`, include both — the AC section can list the fixed-behavior assertions (e.g. `- [ ] Login succeeds for valid credentials`). The validator only checks for the presence of `Acceptance Criteria`; other sections are free-form.
