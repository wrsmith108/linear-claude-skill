/**
 * Tests for issue-description validator.
 *
 * Run: npm test (or node --test dist/__tests__/issue-description.test.js)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateIssueDescription,
  buildIssueTemplate,
  isStrictMode,
  MIN_AC_ITEMS,
} from '../lib/issue-description.ts';

const FULL_VALID = [
  '## Context',
  'We need to enforce acceptance criteria on every new Linear issue because today the description field is optional and frequently empty.',
  '',
  '## Acceptance Criteria',
  '- [ ] Validator rejects descriptions shorter than the minimum body length',
  '- [ ] Validator accepts descriptions that include the full template',
  '',
  '## Out of Scope',
  '- Backfilling existing issues',
].join('\n');

describe('validateIssueDescription', () => {
  it('rejects an empty string', () => {
    const r = validateIssueDescription('');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /empty/i.test(e)));
  });

  it('rejects whitespace-only input', () => {
    const r = validateIssueDescription('   \n\t  \n');
    assert.strictEqual(r.valid, false);
  });

  it('rejects a short description with no AC heading', () => {
    const r = validateIssueDescription('too short');
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => /Acceptance Criteria heading missing/i.test(e)));
    assert.ok(r.errors.some(e => /minimum is/i.test(e)));
  });

  it('rejects an AC heading with zero bullets', () => {
    const input = [
      '## Context',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
      '',
      '## Acceptance Criteria',
      '',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => new RegExp(`Fewer than ${MIN_AC_ITEMS}`).test(e)));
  });

  it('rejects placeholder-only AC items (e.g. <criterion>, TODO)', () => {
    const input = [
      '## Context',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
      '',
      '## Acceptance Criteria',
      '- [ ] <criterion>',
      '- [ ] TODO',
      '- [ ] ',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => new RegExp(`Fewer than ${MIN_AC_ITEMS}`).test(e)));
  });

  it('accepts a full valid template', () => {
    const r = validateIssueDescription(FULL_VALID);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
  });

  it('accepts H4 Acceptance Criteria heading', () => {
    const input = [
      '## Context',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
      '',
      '#### Acceptance Criteria',
      '- Validator rejects short descriptions without AC heading',
      '- Validator accepts H4 headings',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
  });

  it('accepts plain `- ` bullets (no checkbox)', () => {
    const input = [
      '## Context',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
      '',
      '## Acceptance Criteria',
      '- Validator rejects short descriptions',
      '- Validator accepts full template',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, true, JSON.stringify(r.errors));
  });

  it('stops counting AC bullets at the next heading', () => {
    const input = [
      '## Context',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
      '',
      '## Acceptance Criteria',
      '- Only one real item here',
      '',
      '## Out of Scope',
      '- Not counted as an AC item',
      '- Also not counted',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, false);
    assert.ok(r.errors.some(e => new RegExp(`Fewer than ${MIN_AC_ITEMS}`).test(e)));
  });

  it('warns when Context/Why heading is missing', () => {
    const input = [
      '## Acceptance Criteria',
      '- Validator rejects short descriptions',
      '- Validator accepts full template',
      '',
      'Some reasonable length of body text that exceeds the minimum character count threshold set by the validator.',
    ].join('\n');
    const r = validateIssueDescription(input);
    assert.strictEqual(r.valid, true);
    assert.ok(r.warnings.some(w => /Context\/Why/i.test(w)));
  });
});

describe('buildIssueTemplate', () => {
  it('returns a string containing required sections', () => {
    const t = buildIssueTemplate();
    assert.ok(t.includes('## Context'));
    assert.ok(t.includes('## Problem'));
    assert.ok(t.includes('## Proposal'));
    assert.ok(t.includes('## Acceptance Criteria'));
    assert.ok(t.includes('## Verification'));
    assert.ok(t.includes('## Out of Scope'));
  });

  it('does NOT include an H1', () => {
    const t = buildIssueTemplate('My title');
    assert.ok(!/^#\s+/m.test(t), 'template must not include an H1 heading');
  });

  it('embeds the title as a Title: line when supplied', () => {
    const t = buildIssueTemplate('Test title here');
    assert.ok(t.includes('**Title:** Test title here'));
  });

  it('uses a placeholder when title omitted', () => {
    const t = buildIssueTemplate();
    assert.ok(t.includes('**Title:** <to fill>'));
  });
});

describe('isStrictMode precedence', () => {
  it('defaults to strict when nothing is set', () => {
    const orig = process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    delete process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    try {
      assert.strictEqual(isStrictMode(), true);
    } finally {
      if (orig !== undefined) process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA = orig;
    }
  });

  it('env var = 0 ⇒ non-strict', () => {
    const orig = process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA = '0';
    try {
      assert.strictEqual(isStrictMode(), false);
    } finally {
      if (orig !== undefined) process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA = orig;
      else delete process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    }
  });

  it('--strict=false flag beats env var unset', () => {
    assert.strictEqual(isStrictMode(false), false);
  });

  it('--strict=true flag beats env var = 0', () => {
    const orig = process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA = '0';
    try {
      assert.strictEqual(isStrictMode(true), true);
    } finally {
      if (orig !== undefined) process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA = orig;
      else delete process.env.LINEAR_REQUIRE_ACCEPTANCE_CRITERIA;
    }
  });
});
