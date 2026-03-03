import fs from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'

/**
 * Loads the skill instruction body, stripping out the YAML frontmatter.
 * This ensures the LLM is only fed the actual Markdown instructions.
 *
 * @param skillPath - The path to the skill directory
 * @returns A promise that resolves to the clean Markdown content of the SKILL.md file
 */
export async function activateSkill(skillPath: string): Promise<string> {
  const skillMdPath = path.join(skillPath, 'SKILL.md')

  try {
    const rawContent = await fs.readFile(skillMdPath, 'utf8')
    // Using gray-matter to strip the frontmatter and extract the `.content` (the body text)
    const { content } = matter(rawContent)
    return content.trim()
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to activate skill at ${skillPath}: ${error.message}`)
    }
    throw error
  }
}
