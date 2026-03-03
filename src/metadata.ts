import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'

// Name validation: 1-64 chars, lowercase alphanumeric and hyphens, no consecutive hyphens, no starting/ending hyphen
const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Must be lowercase alphanumeric or hyphens, cannot start/end with hyphen'
  )
  .refine((s) => !s.includes('--'), 'Cannot contain consecutive hyphens')

export const SkillMetadataSchema = z.object({
  name: nameSchema,
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
})

export type SkillMetadata = z.infer<typeof SkillMetadataSchema>

export interface SkillInfo extends SkillMetadata {
  path: string
}

/**
 * Loads and rigorously validates the metadata of a skill from its SKILL.md file.
 *
 * @param skillPath - The absolute path to the skill directory
 * @returns The validated metadata including the skill's path
 */
export async function loadSkillMetadata(skillPath: string): Promise<SkillInfo> {
  const skillMdPath = path.join(skillPath, 'SKILL.md')
  const dirName = path.basename(skillPath)

  try {
    const content = await fs.readFile(skillMdPath, 'utf8')
    const { data } = matter(content)

    // Validate using Zod
    const metadata = SkillMetadataSchema.parse(data)

    // Spec Requirement: name must match the parent directory name
    if (metadata.name !== dirName) {
      throw new Error(
        `Skill name '${metadata.name}' does not match its directory name '${dirName}'`
      )
    }

    return {
      ...metadata,
      path: skillPath,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      throw new Error(`Invalid SKILL.md frontmatter at ${skillPath}: ${issues}`)
    }
    if (error instanceof Error) {
      throw new Error(`Failed to load metadata for skill at ${skillPath}: ${error.message}`)
    }
    throw error
  }
}

/**
 * Generates the <available_skills> XML block for system prompts.
 *
 * @param skills - Array of loaded SkillInfo objects
 * @param includeLocation - Whether to include the <location> tag (true for filesystem-based agents)
 * @returns The XML string block
 */
export function generateSkillsPrompt(skills: SkillInfo[], includeLocation = true): string {
  if (skills.length === 0) return ''

  const skillBlocks = skills.map((skill) => {
    let block = `  <skill>\n    <name>${skill.name}</name>\n    <description>${skill.description}</description>\n`
    if (includeLocation) {
      block += `    <location>${path.join(skill.path, 'SKILL.md')}</location>\n`
    }
    block += `  </skill>`
    return block
  })

  return `<available_skills>\n${skillBlocks.join('\n')}\n</available_skills>`
}
