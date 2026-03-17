/**
 * Project Creation Template
 *
 * MANDATORY: Every project creation MUST use this template to ensure:
 * 1. Project linked to initiative
 * 2. Description set (short 255 char limit)
 * 3. Content set (full markdown)
 * 4. Labels created/verified
 * 5. Issues created with labels
 * 6. Post-execution verification
 */
import { getLinearClient } from './linear-utils'
import { linkProjectToInitiative, DEFAULT_INITIATIVE_ID } from './initiative'
import { ensureLabelsExist, extractUniqueLabels } from './labels'
import { verifyProjectCreation } from './verify'

export interface IssueConfig {
  title: string
  description: string
  labels: string[]
  priority?: number
  estimate?: number
}

export interface ProjectConfig {
  name: string
  shortDescription: string // 255 char limit
  content: string // Full markdown
  state: 'planned' | 'started' | 'paused' | 'completed' | 'canceled'
  initiative: string // Initiative ID to link to
  issues: IssueConfig[]
}

export interface CreateResult {
  project: {
    id: string
    name: string
    created: boolean
    linkedToInitiative: boolean
    contentSet: boolean
  }
  labels: {
    created: string[]
    existing: string[]
    failed: string[]
  }
  issues: {
    created: Array<{ identifier: string; title: string }>
    failed: Array<{ title: string; error: string }>
  }
  verification: {
    passed: boolean
    issues: string[]
  }
}

/**
 * Create a project with all required components
 *
 * This is the ONLY correct way to create a project. It ensures:
 * 1. Project created with description
 * 2. Project linked to initiative
 * 3. Content set via projectUpdate
 * 4. Labels created/verified
 * 5. Issues created with labels
 * 6. Post-execution verification
 */
export async function createProject(
  teamId: string,
  config: ProjectConfig
): Promise<CreateResult> {
  const result: CreateResult = {
    project: {
      id: '',
      name: config.name,
      created: false,
      linkedToInitiative: false,
      contentSet: false
    },
    labels: {
      created: [],
      existing: [],
      failed: []
    },
    issues: {
      created: [],
      failed: []
    },
    verification: {
      passed: false,
      issues: []
    }
  }

  console.log(`\n=== Creating Project: ${config.name} ===\n`)

  // Step 1: Create or find project
  console.log('Step 1: Creating project...')
  let projectId: string

  const existingProjects = await getLinearClient().projects({
    filter: { name: { eq: config.name } }
  })

  if (existingProjects.nodes.length > 0) {
    projectId = existingProjects.nodes[0].id
    console.log(`  Found existing project: ${projectId}`)
  } else {
    const createResult = await getLinearClient().createProject({
      teamIds: [teamId],
      name: config.name,
      description: config.shortDescription.substring(0, 255)
    })
    const project = await createResult.project
    if (!project) {
      result.verification.issues.push('Failed to create project')
      return result
    }
    projectId = project.id
    console.log(`  Created project: ${projectId}`)
  }

  result.project.id = projectId
  result.project.created = true

  // Step 2: Link to initiative (MANDATORY)
  console.log('Step 2: Linking to initiative...')
  const linkResult = await linkProjectToInitiative(projectId, config.initiative)
  if (linkResult.success) {
    result.project.linkedToInitiative = true
    console.log('  ✓ Linked to initiative')
  } else {
    console.log(`  ⚠ Initiative link failed: ${linkResult.error}`)
    result.verification.issues.push(`Initiative link failed: ${linkResult.error}`)
  }

  // Step 3: Set content via projectUpdate
  console.log('Step 3: Setting project content...')
  try {
    const mutation = `
      mutation UpdateProjectContent($id: String!, $input: ProjectUpdateInput!) {
        projectUpdate(id: $id, input: $input) {
          success
        }
      }
    `

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.LINEAR_API_KEY || ''
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          id: projectId,
          input: {
            content: config.content,
            description: config.shortDescription.substring(0, 255)
          }
        }
      })
    })

    const mutationResult = await response.json()
    if (mutationResult.data?.projectUpdate?.success) {
      result.project.contentSet = true
      console.log('  ✓ Content set')
    } else {
      console.log(`  ⚠ Content setting failed: ${JSON.stringify(mutationResult.errors)}`)
    }
  } catch (error) {
    console.log(`  ⚠ Content setting error: ${error}`)
  }

  // Step 4: Ensure all labels exist
  console.log('Step 4: Creating labels...')
  const allLabels = extractUniqueLabels(
    Object.fromEntries(config.issues.map((i, idx) => [`issue-${idx}`, i.labels]))
  )

  const labelResult = await ensureLabelsExist(teamId, allLabels)
  result.labels = {
    created: labelResult.created,
    existing: labelResult.existing,
    failed: labelResult.failed
  }
  console.log(`  Created: ${labelResult.created.length}, Existing: ${labelResult.existing.length}`)

  // Step 5: Create issues with labels
  console.log('Step 5: Creating issues...')
  const labelMap = labelResult.labelMap

  for (const issueConfig of config.issues) {
    try {
      // Get label IDs
      const labelIds = issueConfig.labels
        .map(name => labelMap.get(name.toLowerCase()))
        .filter((id): id is string => id !== undefined)

      const issueResult = await getLinearClient().createIssue({
        teamId,
        projectId,
        title: issueConfig.title,
        description: issueConfig.description,
        labelIds,
        priority: issueConfig.priority,
        estimate: issueConfig.estimate
      })

      const issue = await issueResult.issue
      if (issue) {
        result.issues.created.push({
          identifier: issue.identifier,
          title: issue.title
        })
        console.log(`  ✓ ${issue.identifier}: ${issue.title.substring(0, 40)}...`)
      } else {
        result.issues.failed.push({
          title: issueConfig.title,
          error: 'Issue creation returned null'
        })
      }
    } catch (error) {
      result.issues.failed.push({
        title: issueConfig.title,
        error: String(error)
      })
      console.log(`  ✗ ${issueConfig.title}: ${error}`)
    }
  }

  // Step 6: Verification
  console.log('\nStep 6: Verifying...')
  const verification = await verifyProjectCreation(
    config.name,
    config.issues.length,
    undefined,
    config.initiative
  )

  result.verification = verification.overall

  if (verification.overall.passed) {
    console.log('  ✅ All checks passed')
  } else {
    console.log('  ❌ Verification failed:')
    verification.overall.issues.forEach(i => console.log(`    - ${i}`))
  }

  return result
}

/**
 * Create a project using the default initiative from environment
 *
 * Requires LINEAR_DEFAULT_INITIATIVE_ID to be set
 */
export async function createProjectWithDefaults(
  config: Omit<ProjectConfig, 'initiative'>
): Promise<CreateResult> {
  if (!DEFAULT_INITIATIVE_ID) {
    throw new Error('LINEAR_DEFAULT_INITIATIVE_ID environment variable is required')
  }

  // Get team
  const teams = await getLinearClient().teams()
  const team = teams.nodes[0]

  return createProject(team.id, {
    ...config,
    initiative: DEFAULT_INITIATIVE_ID
  })
}

