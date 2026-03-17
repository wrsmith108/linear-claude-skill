/**
 * Label Management Utilities
 *
 * Ensures labels exist and are properly applied to issues.
 * Handles case-sensitivity issues and provides verification.
 * Integrates with the domain-based label taxonomy.
 */
import { getLinearClient } from './linear-utils'
import { buildColorMap } from './taxonomy-data'
import { validateLabels, type ValidationResult } from './taxonomy-validation'

// Use taxonomy colors as primary source, with fallbacks for legacy labels
const TAXONOMY_COLORS = buildColorMap()
const LEGACY_COLORS: Record<string, string> = {
  // Legacy labels not in taxonomy (kept for backwards compatibility)
  npm: '#CB3837',
  ci: '#2088FF',
  build: '#0E8A16',
  automation: '#5319E7',
  legal: '#FEF2C0',
  vscode: '#007ACC',
  ux: '#D4C5F9',
  billing: '#F9D0C4',
  stripe: '#635BFF',
  marketplace: '#BFD4F2',
  website: '#3B82F6',
  auth: '#EF4444',
  dashboard: '#06B6D4',
  reporting: '#D93F0B'
}

// Merged colors (taxonomy takes precedence)
const LABEL_COLORS: Record<string, string> = {
  ...LEGACY_COLORS,
  ...TAXONOMY_COLORS
}

/**
 * Get all existing labels for a team (case-insensitive map)
 */
export async function getLabelMap(teamId?: string): Promise<Map<string, string>> {
  const labelsResult = await getLinearClient().issueLabels(
    teamId ? { filter: { team: { id: { eq: teamId } } } } : undefined
  )

  const labelMap = new Map<string, string>()
  for (const label of labelsResult.nodes) {
    // Store both original case and lowercase for lookup
    labelMap.set(label.name.toLowerCase(), label.id)
  }

  return labelMap
}

/**
 * Options for ensureLabelsExist
 */
export interface EnsureLabelsOptions {
  /** If true, validate labels against taxonomy before creating */
  validate?: boolean
  /** If true and validate is true, fail on taxonomy errors */
  strict?: boolean
}

/**
 * Result of ensureLabelsExist with validation
 */
export interface EnsureLabelsResult {
  created: string[]
  existing: string[]
  failed: string[]
  labelMap: Map<string, string>
  /** Validation result if validate option was true */
  validation?: ValidationResult
}

/**
 * Ensure all required labels exist, creating missing ones
 *
 * @param teamId - Linear team ID
 * @param labelNames - Array of label names to ensure exist
 * @param options - Optional settings for validation
 */
export async function ensureLabelsExist(
  teamId: string,
  labelNames: string[],
  options: EnsureLabelsOptions = {}
): Promise<EnsureLabelsResult> {
  const labelMap = await getLabelMap(teamId)
  const created: string[] = []
  const existing: string[] = []
  const failed: string[] = []

  // Validate against taxonomy if requested
  let validation: ValidationResult | undefined
  if (options.validate) {
    validation = validateLabels(labelNames)

    // In strict mode, fail if validation has errors
    if (options.strict && !validation.valid) {
      return {
        created: [],
        existing: [],
        failed: validation.errors,
        labelMap,
        validation
      }
    }

    // Warn about unknown labels (but still create them unless strict)
    if (validation.parsed.unknown.length > 0 && !options.strict) {
      console.warn(`[WARN] Creating labels not in taxonomy: ${validation.parsed.unknown.join(', ')}`)
    }
  }

  for (const name of labelNames) {
    const key = name.toLowerCase()

    if (labelMap.has(key)) {
      existing.push(name)
      continue
    }

    try {
      const result = await getLinearClient().createIssueLabel({
        teamId,
        name,
        color: LABEL_COLORS[key] || '#6B7280'
      })
      const label = await result.issueLabel
      if (label) {
        labelMap.set(key, label.id)
        created.push(name)
      } else {
        failed.push(name)
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('Duplicate')) {
        // Race condition - label was created elsewhere
        existing.push(name)
        // Refresh label map to get the ID
        const refreshed = await getLabelMap(teamId)
        const id = refreshed.get(key)
        if (id) labelMap.set(key, id)
      } else {
        failed.push(`${name}: ${error}`)
      }
    }
  }

  return { created, existing, failed, labelMap, validation }
}

/**
 * Apply labels to an issue (merges with existing)
 */
export async function applyLabelsToIssue(
  issueId: string,
  labelNames: string[],
  labelMap: Map<string, string>
): Promise<{ applied: string[]; skipped: string[]; error?: string }> {
  const applied: string[] = []
  const skipped: string[] = []

  try {
    // Get existing labels
    const issue = await getLinearClient().issue(issueId)
    const existingLabels = await issue.labels()
    const existingIds = new Set(existingLabels.nodes.map(l => l.id))

    // Find new label IDs to add
    const newLabelIds: string[] = []
    for (const name of labelNames) {
      const id = labelMap.get(name.toLowerCase())
      if (!id) {
        skipped.push(`${name} (not found)`)
        continue
      }
      if (existingIds.has(id)) {
        skipped.push(`${name} (already applied)`)
        continue
      }
      newLabelIds.push(id)
      applied.push(name)
    }

    if (newLabelIds.length === 0) {
      return { applied, skipped }
    }

    // Merge and update
    const allLabelIds = [...existingIds, ...newLabelIds]
    await getLinearClient().updateIssue(issueId, { labelIds: allLabelIds })

    return { applied, skipped }
  } catch (error) {
    return { applied, skipped, error: String(error) }
  }
}

/**
 * Verify labels are applied to an issue
 */
export async function verifyLabelsApplied(
  issueId: string,
  expectedLabels: string[]
): Promise<{ applied: string[]; missing: string[] }> {
  try {
    const issue = await getLinearClient().issue(issueId)
    const labels = await issue.labels()
    const appliedLower = new Set(labels.nodes.map(l => l.name.toLowerCase()))

    const applied: string[] = []
    const missing: string[] = []

    for (const expected of expectedLabels) {
      if (appliedLower.has(expected.toLowerCase())) {
        applied.push(expected)
      } else {
        missing.push(expected)
      }
    }

    return { applied, missing }
  } catch {
    return { applied: [], missing: expectedLabels }
  }
}

/**
 * Get all unique labels from a set of issues
 */
export function extractUniqueLabels(
  issueLabels: Record<string, string[]>
): string[] {
  const unique = new Set<string>()
  for (const labels of Object.values(issueLabels)) {
    for (const label of labels) {
      unique.add(label.toLowerCase())
    }
  }
  return Array.from(unique)
}

// Re-export taxonomy utilities for convenience
export {
  // Types
  type LabelCategory,
  type DomainLabel,
  type TypeLabel,
  type ScopeLabel,
  type TaxonomyLabel,
  type AgentId,
  type LabelDefinition,
  type LabelTaxonomy,
  type LabelSuggestion,
  type AgentSelection
} from './taxonomy'

export {
  LABEL_TAXONOMY,
  getAllLabels,
  getAllLabelNames,
  getLabelByName,
  isValidLabel,
  getLabelsByCategory,
  getLabelColor,
  DOMAIN_LABEL_NAMES,
  TYPE_LABEL_NAMES,
  SCOPE_LABEL_NAMES
} from './taxonomy-data'

export {
  validateLabels,
  suggestLabels,
  getLabelCategory,
  hasValidTypeLabel,
  hasDomainLabel,
  filterToTaxonomy,
  formatValidationResult,
  formatSuggestions
} from './taxonomy-validation'

export {
  selectAgentsForIssue,
  getLabelsForAgent,
  canAgentHandle,
  buildAgentDomainMatrix,
  formatAgentSelection,
  formatAgentMatrix,
  AGENT_DESCRIPTIONS
} from './agent-selection'

