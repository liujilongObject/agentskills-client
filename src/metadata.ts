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

export interface SkillDiagnostic {
  type: 'warning' | 'error'
  message: string
  path: string
}

export interface LoadSkillResult {
  skill: SkillInfo | null
  diagnostics: SkillDiagnostic[]
}

/**
 * Loads and rigorously validates the metadata of a skill from its SKILL.md file.
 * Returns the parsed skill (or null if fatal) along with any diagnostics.
 *
 * @param skillPath - The absolute path to the skill directory
 * @returns An object containing the loaded skill and diagnostics array
 */
export async function loadSkillMetadata(skillPath: string): Promise<LoadSkillResult> {
  const diagnostics: SkillDiagnostic[] = []
  const skillMdPath = path.join(skillPath, 'SKILL.md')
  const dirName = path.basename(skillPath)

  try {
    const content = await fs.readFile(skillMdPath, 'utf8')
    const { data } = matter(content)

    // Fallback: If name is not provided in frontmatter, use the directory name.
    const rawName = (data as SkillMetadata).name || dirName

    // Validate using Zod with the resolved name
    const parsed = SkillMetadataSchema.safeParse({ ...data, name: rawName })

    if (!parsed.success) {
      const issues = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      diagnostics.push({
        type: 'error',
        message: `Invalid SKILL.md frontmatter: ${issues}`,
        path: skillMdPath,
      })
      return { skill: null, diagnostics }
    }

    const metadata = parsed.data

    // Spec Requirement: name must match the parent directory name
    if (metadata.name !== dirName) {
      diagnostics.push({
        type: 'error',
        message: `Skill name '${metadata.name}' does not match its directory name '${dirName}'`,
        path: skillMdPath,
      })
      // Even if name mismatches, per pi-skills.ts behavior, we could optionally still load it with a warning,
      // but the spec strongly implies they should match. Let's return null to prevent loading misnamed skills,
      // or we can just warn. Since the previous code threw an error, changing to error diagnostic + null is safe.
      return { skill: null, diagnostics }
    }

    return {
      skill: {
        ...metadata,
        path: skillPath,
      },
      diagnostics,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    diagnostics.push({
      type: 'error',
      message: `Failed to load metadata: ${message}`,
      path: skillMdPath,
    })
    return { skill: null, diagnostics }
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
