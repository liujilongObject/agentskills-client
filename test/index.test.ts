import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  discoverSkills,
  getSkillByName,
  loadSkillMetadata,
  generateSkillsPrompt,
  activateSkill,
  executeScript,
  readResource,
  ExecutionError
} from '../src/index'

vi.mock('node:fs/promises')
vi.mock('node:child_process', () => {
  return {
    execFile: vi.fn((cmd, args, options, callback) => {
      // In executeScript, util.promisify is used so it passes a callback at the end
      if (args[0] && args[0].includes('error.js')) {
        const err: any = new Error('Command failed')
        err.stderr = 'some error'
        err.stdout = ''
        err.code = 1
        callback(err, { stdout: '', stderr: 'some error' }, { stderr: 'some error', stdout: '' })
      } else {
        callback(null, { stdout: 'hello world\n', stderr: '' }, { stdout: 'hello world\n', stderr: '' })
      }
    })
  }
})

describe('discoverSkills', () => {
  it('should discover valid skills', async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dirPath) => {
      if (dirPath === '/test/dir') {
        return [
          { name: 'skill-a', isDirectory: () => true },
          { name: 'skill-b', isDirectory: () => true },
          { name: 'file.txt', isDirectory: () => false },
        ] as any
      }
      return [] as any
    })

    vi.mocked(fs.stat).mockImplementation(async (p: any) => {
      if (p.includes('skill-a')) return { isFile: () => true } as any
      throw new Error('Not found')
    })

    const skills = await discoverSkills('/test/dir')
    expect(skills).toHaveLength(1)
    expect(skills[0]).toContain(path.normalize('/test/dir/skill-a'))
  })
})

describe('getSkillByName', () => {
  it('should throw an error if skill directory does not exist or SKILL.md is missing', async () => {
    vi.mocked(fs.stat).mockRejectedValue(new Error('Not found'))
    await expect(getSkillByName('/test/dir', 'non-existent')).rejects.toThrow('Not found')
  })

  it('should return null if SKILL.md is not a file', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => false } as any)
    const result = await getSkillByName('/test/dir', 'not-a-file')
    expect(result).toBeNull()
  })

  it('should return skill info with content if valid', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any)
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: valid-skill
description: A test skill
---
# Content here`)

    const result = await getSkillByName('/test/dir', 'valid-skill')
    expect(result).not.toBeNull()
    expect(result?.name).toBe('valid-skill')
    expect(result?.description).toBe('A test skill')
    expect(result?.content).toBe('# Content here')
  })

  it('should return null if metadata loading fails', async () => {
    vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any)
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: wrong-name
description: A test skill
---
body`)

    const result = await getSkillByName('/test/dir', 'valid-skill')
    expect(result).toBeNull()
  })
})

describe('loadSkillMetadata', () => {
  it('should load and validate skill metadata', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: valid-skill
description: A test skill
---
body
`)
    const result = await loadSkillMetadata('/path/to/valid-skill')
    expect(result.skill?.name).toBe('valid-skill')
    expect(result.skill?.description).toBe('A test skill')
    expect(result.skill?.path).toBe('/path/to/valid-skill')
    expect(result.diagnostics).toHaveLength(0)
  })

  it('should return error diagnostic if name does not match directory', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: wrong-name
description: A test skill
---
body
`)
    const result = await loadSkillMetadata('/path/to/valid-skill')
    expect(result.skill).toBeNull()
    expect(result.diagnostics[0].message).toMatch(/does not match its directory name/)
  })

  it('should fallback to directory name if name is missing', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(`---
description: A test skill
---
body
`)
    const result = await loadSkillMetadata('/path/to/valid-skill')
    expect(result.skill?.name).toBe('valid-skill')
    expect(result.skill?.description).toBe('A test skill')
    expect(result.diagnostics).toHaveLength(0)
  })
})

describe('generateSkillsPrompt', () => {
  it('should generate XML block', () => {
    const skills = [{
      name: 'test-skill',
      description: 'A skill',
      path: '/path/test-skill'
    }]
    const xml = generateSkillsPrompt(skills)
    expect(xml).toContain('<available_skills>')
    expect(xml).toContain('<name>test-skill</name>')
    expect(xml).toContain('<description>A skill</description>')
    expect(xml).toContain('SKILL.md')
  })
})

describe('activateSkill', () => {
  it('should return markdown body without frontmatter', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(`---
name: test
description: desc
---
# Body
content`)
    const result = await activateSkill('/path/to/test')
    expect(result).toBe('# Body\ncontent')
  })
})

describe('executeScript', () => {
  it('should execute js script successfully', async () => {
    const result = await executeScript('/skill/dir', 'script.js')
    expect(result.stdout).toBe('hello world\n')
  })

  it('should throw if script is outside skill dir', async () => {
    await expect(executeScript('/skill/dir', '../script.js')).rejects.toThrow(/Security Violation/)
  })

  it('should execute with confirm hook', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true)
    const result = await executeScript('/skill/dir', 'script.js', { onConfirm })
    expect(onConfirm).toHaveBeenCalled()
    expect(result.stdout).toBe('hello world\n')
  })

  it('should abort if not confirmed', async () => {
    const onConfirm = vi.fn().mockResolvedValue(false)
    await expect(executeScript('/skill/dir', 'script.js', { onConfirm })).rejects.toThrow(/aborted by user confirmation/)
  })

  it('should handle execution errors', async () => {
    await expect(executeScript('/skill/dir', 'error.js')).rejects.toThrow(ExecutionError)
  })
})

describe('readResource', () => {
  it('should read resource safely', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('resource content')
    const result = await readResource('/skill/dir', 'res.txt')
    expect(result).toBe('resource content')
  })

  it('should throw if resource is outside skill dir', async () => {
    await expect(readResource('/skill/dir', '../res.txt')).rejects.toThrow(/Security Violation/)
  })
})
