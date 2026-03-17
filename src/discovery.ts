import fs from 'node:fs/promises'
import path from 'node:path'
import { SkillInfo, loadSkillMetadata } from './metadata'
import { activateSkill } from './activation'

const DEFAULT_IGNORED_DIRS = new Set(['node_modules', '.git', '.venv', 'dist', 'build', '.idea'])

export interface DiscoverSkillsOptions {
  /** Enables recursive scanning of subdirectories. Default: true */
  recursive?: boolean
  /** Array of directory names to ignore. Default: ['node_modules', '.git', '.venv', 'dist', 'build', '.idea'] */
  ignoreDirs?: string[]
}

/**
 * Discovers skills in a configured directory.
 * A skill is considered valid if it's a directory containing a SKILL.md file.
 *
 * @param directoryPath - The path to the directory containing skills
 * @param options - Options for discovery, including recursive scanning and ignore lists
 * @returns An array of absolute paths to the discovered skill directories
 */
export async function discoverSkills(
  directoryPath: string,
  options: DiscoverSkillsOptions = {}
): Promise<string[]> {
  const recursive = options.recursive ?? true
  const ignoredDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORED_DIRS)
  const skills: string[] = []

  async function scanDir(currentPath: string) {
    try {
      const entries = await fs.readdir(currentPath, {
        withFileTypes: true,
      })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip ignored directories and hidden directories
          if (ignoredDirs.has(entry.name) || entry.name.startsWith('.')) {
            continue
          }

          const childPath = path.resolve(currentPath, entry.name)
          const skillMdPath = path.join(childPath, 'SKILL.md')

          try {
            const stats = await fs.stat(skillMdPath)
            if (stats.isFile()) {
              skills.push(childPath)
            }
          } catch {
            // SKILL.md does not exist or cannot be accessed, ignore this directory
          }

          // Continue scanning recursively if enabled
          if (recursive) {
            await scanDir(childPath)
          }
        }
      }
    } catch (error) {
      // Ignore permission denied errors or missing subdirectories during recursion
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'EACCES') {
        return
      }
      throw error
    }
  }

  try {
    await scanDir(directoryPath)
    return skills
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to discover skills in directory ${directoryPath}: ${error.message}`)
    }
    throw error
  }
}

// interface SkillInfoWithContent extends SkillInfo {
//   content: string
// }

/**
 * Search for and load a single skill from the specified directory based on the skill name
 * (the specification stipulates that the skill name and the directory name must match).
 *
 * @param directoryPath - The path to the directory containing skills
 * @param name - The skill name to search for
 * @returns Skill objects that load successfully will return null if not found or if loading fails.
 */
export async function getSkillByName(
  directoryPath: string,
  name: string
): Promise<SkillInfo | null> {
  const skillPath = path.join(directoryPath, name)
  const skillMdPath = path.join(skillPath, 'SKILL.md')

  try {
    const stats = await fs.stat(skillMdPath)
    if (!stats.isFile()) {
      return null
    }

    const skillMetadata = await loadSkillMetadata(skillPath)
    if (!skillMetadata.skill) {
      return null
    }

    const skillContent = await activateSkill(skillPath)

    return { ...skillMetadata.skill, content: skillContent }
  } catch (error) {
    throw error
  }
}
