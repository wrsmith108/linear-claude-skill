/**
 * Linear Skill Shared Utilities
 *
 * This module provides standardized utilities for Linear operations.
 * All project creation scripts MUST use these utilities to ensure
 * consistency and avoid regressions.
 *
 * Configuration:
 *   LINEAR_API_KEY              - Required for all operations
 *   LINEAR_DEFAULT_INITIATIVE_ID - Optional default initiative for linking
 */

// Initiative utilities
export {
  DEFAULT_INITIATIVE_ID,
  INITIATIVES,  // Deprecated, use DEFAULT_INITIATIVE_ID
  linkProjectToInitiative,
  isProjectLinkedToInitiative,
  getProjectInitiativeStatus,
  linkProjectsToInitiative
} from './initiative'

// Label utilities
export {
  getLabelMap,
  ensureLabelsExist,
  applyLabelsToIssue,
  verifyLabelsApplied,
  extractUniqueLabels,
  type EnsureLabelsOptions,
  type EnsureLabelsResult
} from './labels'

// Label taxonomy utilities
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
  type ValidationResult,
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

// Issue description validation
export {
  validateIssueDescription,
  buildIssueTemplate,
  formatDescriptionValidationResult,
  formatWarningsOnly,
  isStrictMode,
  MIN_BODY_CHARS,
  MIN_AC_ITEMS,
  type DescriptionValidationResult
} from './issue-description'

export {
  selectAgentsForIssue,
  getLabelsForAgent,
  canAgentHandle,
  buildAgentDomainMatrix,
  formatAgentSelection,
  formatAgentMatrix,
  AGENT_DESCRIPTIONS
} from './agent-selection'

// Verification utilities
export {
  verifyProjectCreation,
  verifyProjectsForInitiative,
  printVerificationReport,
  type ProjectVerification
} from './verify'

// Client utilities
export {
  getLinearClient,
  createLinearClient,
  findProjectByName,
  findInitiativeByName,
  findTeamByKey,
  findTeamByName,
  findWorkflowStateIdByName,
  findLabelIdsByName,
  isValidHealth,
  VALID_HEALTH_VALUES,
  type HealthStatus,
  type ProjectInfo,
  type InitiativeInfo,
  type TeamInfo,
  type LabelLookupResult
} from './linear-utils'

// Lin CLI integration (optional fast-path)
export {
  detectLinCli,
  isLinCliAvailable,
  execLin,
  tryLin,
  linUpdateIssueState,
  parseLinVersion,
  _resetDetectionCache,
  type LinCliInfo,
  type LinCliResult,
  type LinUser,
  type LinIssue,
  type LinInitiative,
  type IssueFilters
} from './lin-cli'

// Project template
export {
  createProject,
  createProjectWithDefaults,
  type ProjectConfig,
  type IssueConfig,
  type CreateResult
} from './project-template'

// Retry helper
export {
  withRetry,
  extractStatusCode,
  extractRetryAfterMs,
  isRetryableStatus,
  isRetryDisabled,
  computeBackoffMs,
  type RetryOptions
} from './retry'
