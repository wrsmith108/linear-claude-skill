/**
 * Issue Description Validation
 *
 * Enforces that every new Linear issue has a detailed description with a
 * populated Acceptance Criteria section. Mirrors the taxonomy-validation.ts
 * pattern: a pure validator returning {valid, errors, warnings}.
 */

/** Minimum body length (excluding heading lines). */
export const MIN_BODY_CHARS = 120

/** Minimum number of non-placeholder acceptance-criteria bullets. */
export const MIN_AC_ITEMS = 2

/** Matches `# Acceptance Criteria` through `###### Acceptance Criteria`. */
const AC_HEADING_RE = /^#{1,6}\s+Acceptance Criteria\b.*$/im

/** A checkbox/bullet whose body is empty or a common placeholder. */
const PLACEHOLDER_RE = /^\s*(TODO|FIXME|TBD|TBA|N\/A|XXX|\?+|<[^>]*>|\.\.\.|-{2,}|_{2,})\s*$/i

export interface DescriptionValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate an issue description against the acceptance-criteria contract.
 *
 * Rules (all required for valid=true):
 *   1. Non-empty after trim.
 *   2. At least MIN_BODY_CHARS characters of body (headings excluded).
 *   3. Contains an "Acceptance Criteria" heading (H1-H6).
 *   4. At least MIN_AC_ITEMS non-placeholder bulleted items under that heading.
 */
export function validateIssueDescription(description: string): DescriptionValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = (description ?? '').trim()

  if (trimmed.length === 0) {
    errors.push('Description is empty. Use `--template` to print a starter template.')
    return { valid: false, errors, warnings }
  }

  // Rule 2: body length (strip heading lines before counting)
  const bodyChars = trimmed
    .split(/\r?\n/)
    .filter(line => !/^\s*#{1,6}\s/.test(line))
    .join('\n')
    .length
  if (bodyChars < MIN_BODY_CHARS) {
    errors.push(
      `Description body is ${bodyChars} chars; minimum is ${MIN_BODY_CHARS}. ` +
      `Explain what is changing and why, not just the title.`
    )
  }

  // Rule 3: Acceptance Criteria heading
  const acHeadingMatch = trimmed.match(AC_HEADING_RE)
  if (!acHeadingMatch) {
    errors.push(
      'Acceptance Criteria heading missing. Add a "## Acceptance Criteria" ' +
      'section with a checklist of testable outcomes.'
    )
    // Can't check rule 4 without a heading; still surface warnings below.
  } else {
    // Rule 4: count non-placeholder bullets under the heading
    const lines = trimmed.split(/\r?\n/)
    const headingIdx = lines.findIndex(l => AC_HEADING_RE.test(l))
    const acItems: string[] = []
    for (let i = headingIdx + 1; i < lines.length; i++) {
      const line = lines[i]
      if (/^#{1,6}\s/.test(line)) break // next heading ends the section
      const bullet = line.match(/^\s*(?:-|\*)\s+(?:\[[ xX]\]\s+)?(.*)$/)
      if (!bullet) continue
      const body = bullet[1].trim()
      if (body.length === 0) continue
      if (PLACEHOLDER_RE.test(body)) continue
      acItems.push(body)
    }

    if (acItems.length < MIN_AC_ITEMS) {
      errors.push(
        `Fewer than ${MIN_AC_ITEMS} acceptance-criteria items found (got ${acItems.length}). ` +
        `Replace placeholder text like \`<criterion>\` or \`TODO\` with concrete, testable outcomes.`
      )
    } else if (acItems.every(item => item.length < 10)) {
      warnings.push(
        'All acceptance-criteria items are under 10 characters. They likely need more detail.'
      )
    }
  }

  // Soft warnings
  if (!/^#{1,6}\s+(Context|Why|Background)\b/im.test(trimmed)) {
    warnings.push('No Context/Why/Background heading. Consider adding one to explain motivation.')
  }

  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Return the canonical issue-description template as a string.
 *
 * When `title` is supplied, the Context section opens with a `**Title:**`
 * line so the template stays self-describing when pasted into external tools.
 * The returned string never contains an H1 — Linear renders the issue title
 * separately.
 */
export function buildIssueTemplate(title?: string): string {
  const titleLine = title ? `**Title:** ${title}` : '**Title:** <to fill>'
  return [
    '## Context',
    titleLine,
    '',
    '<What is changing and why. 2-4 sentences. Link prior issues, docs, or incidents that motivate this.>',
    '',
    '## Problem',
    '<What specifically is broken, missing, or insufficient today. Name the file, flow, or behavior.>',
    '',
    '## Proposal',
    '<What you intend to do about it. High-level approach, not implementation line-by-line.>',
    '',
    '## Acceptance Criteria',
    '- [ ] <Concrete, testable outcome>',
    '- [ ] <Concrete, testable outcome>',
    '',
    '## Verification',
    '<How the AC will actually be checked. Manual steps, test command, or review instruction.>',
    '',
    '## Out of Scope',
    '- <What this issue does NOT cover — redirect to the follow-up or explain why it is deferred>',
    ''
  ].join('\n')
}

/**
 * Format a validation result for human consumption. Writes to stderr when used
 * by the CLI; callers are responsible for the actual stream choice.
 *
 * Contract:
 *   - Header line naming the failure.
 *   - Bulleted list of errors.
 *   - Optional warnings block.
 *   - Footer pointing at --template and --strict=false.
 */
export function formatDescriptionValidationResult(result: DescriptionValidationResult): string {
  const lines: string[] = []

  if (result.valid) {
    lines.push('✓ Issue description is valid.')
  } else {
    lines.push('✗ Issue description failed acceptance criteria validation.')
    lines.push('')
    for (const error of result.errors) {
      lines.push(`  • ${error}`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning}`)
    }
  }

  if (!result.valid) {
    lines.push('')
    lines.push(
      'Run `npm run ops -- create-issue --template` to print a ready-to-edit template, ' +
      'or pass --strict=false to downgrade to a warning.'
    )
  }

  return lines.join('\n')
}

/**
 * Render only the warnings block (no valid/invalid banner, no footer). Used by
 * CLI sites that want to surface warnings inline when the description is
 * otherwise valid — printing the full formatter output with a ✓ banner reads
 * as contradictory when the caller is alerting the user to a concern.
 */
export function formatWarningsOnly(result: DescriptionValidationResult): string {
  if (result.warnings.length === 0) return ''
  const lines: string[] = ['Description warnings:']
  for (const warning of result.warnings) {
    lines.push(`  ⚠ ${warning}`)
  }
  return lines.join('\n')
}

/**
 * Decide whether strict-mode is active for the current invocation.
 *
 * Precedence (highest to lowest):
 *   1. Explicit `--strict=false` flag ⇒ warning-only.
 *   2. Explicit `--strict=true` flag ⇒ strict (overrides env var).
 *   3. `LINEAR_REQUIRE_ACCEPTANCE_CRITERIA=0` env var ⇒ warning-only.
 *   4. Default ⇒ strict.
 */
export function isStrictMode(flagValue?: boolean): boolean {
  if (flagValue === false) return false
  if (flagValue === true) return true
  if (process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA === '0') return false
  return true
}
