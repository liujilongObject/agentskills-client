import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Discovers skills in a configured directory.
 * A skill is considered valid if it's a directory containing a SKILL.md file.
 *
 * @param directoryPath - The path to the directory containing skills
 * @returns An array of absolute paths to the discovered skill directories
 */
export async function discoverSkills(directoryPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directoryPath, {
      withFileTypes: true,
      encoding: 'utf-8',
    })
    const skills: string[] = []

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.resolve(directoryPath, entry.name)
        const skillMdPath = path.join(skillPath, 'SKILL.md')

        try {
          const stats = await fs.stat(skillMdPath)
          if (stats.isFile()) {
            skills.push(skillPath)
          }
        } catch {
          // SKILL.md does not exist or cannot be accessed, ignore this directory
        }
      }
    }

    return skills
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to discover skills in directory ${directoryPath}: ${error.message}`)
    }
    throw error
  }
}
