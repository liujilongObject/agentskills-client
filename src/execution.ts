import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface ExecutionLogger {
  info: (message: string) => void
  error: (message: string) => void
}

export interface ExecutionOptions {
  /** Arguments to pass to the script */
  args?: string[]
  /** Custom working directory for the script execution (defaults to process.cwd) */
  cwd?: string
  /** Custom environment variables to inject into the script execution */
  env?: NodeJS.ProcessEnv
  /** Allowed tools list (for validation) */
  allowedTools?: string[]
  /** Hook to optionally confirm execution before running */
  onConfirm?: (command: string, args: string[]) => Promise<boolean>
  /** Optional timeout in milliseconds */
  timeout?: number
  /** Optional logger for auditing script execution without polluting stdout */
  logger?: ExecutionLogger
}

export interface ExecutionResult {
  stdout: string
  stderr: string
}

export class ExecutionError extends Error {
  public stdout?: string
  public stderr?: string
  public code?: number | null

  constructor(message: string, stderr?: string, stdout?: string, code?: number | null) {
    super(message)
    this.name = 'ExecutionError'
    this.stderr = stderr
    this.stdout = stdout
    this.code = code
  }
}

/**
 * Executes a skill script with enterprise security measures (path checks, python support, optional confirmation hooks).
 *
 * @param skillPath - The absolute path to the skill directory (used as security boundary)
 * @param scriptName - The name of the script to execute (relative to skillPath, e.g., 'scripts/extract.py')
 * @param options - Execution options (args, hooks, env, cwd, logger)
 * @returns Execution result containing both stdout and stderr
 */
export async function executeScript(
  skillPath: string,
  scriptName: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const { args = [], onConfirm, timeout = 30000, cwd, env, logger } = options

  // Security: Prevent Path Traversal
  const scriptPath = path.resolve(skillPath, scriptName)
  if (!scriptPath.startsWith(path.resolve(skillPath))) {
    throw new Error('Security Violation: scriptPath resolves outside the skill directory boundary.')
  }

  const ext = path.extname(scriptPath).toLowerCase()

  let command: string
  let commandArgs: string[]

  if (ext === '.js') {
    command = process.execPath // current node executable
    commandArgs = [scriptPath, ...args]
  } else if (ext === '.sh') {
    // Rely on system bash; on Windows this assumes bash is in PATH (e.g., Git Bash, WSL)
    command = 'bash'
    commandArgs = [scriptPath, ...args]
  } else if (ext === '.py') {
    command = process.platform === 'win32' ? 'python' : 'python3'
    commandArgs = [scriptPath, ...args]
  } else {
    throw new Error(`Unsupported script extension: ${ext}. Only .js, .py, and .sh are supported.`)
  }

  try {
    // Basic User Confirmation Step
    if (onConfirm) {
      const confirmed = await onConfirm(command, commandArgs)
      if (!confirmed) {
        throw new Error('Execution aborted by user confirmation.')
      }
    }

    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      timeout,
      cwd: cwd ?? process.cwd(),
      env: env ? { ...process.env, ...env } : process.env,
    })

    if (logger) {
      logger.info(`[Audit] Executed script ${scriptPath} with args ${args.join(' ')}`)
      if (stderr) {
        logger.error(`[Audit] Execution produced stderr:\n${stderr}`)
      }
    }

    return { stdout, stderr }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    if (logger) {
      logger.error(`[Audit] Failed to execute script ${scriptPath}: ${err.message}`)
    }

    const childErr = error as { stderr?: string; stdout?: string; code?: number | null }
    // Wrap child_process errors into a more robust ExecutionError for the caller
    throw new ExecutionError(
      `Failed to execute script ${scriptPath}: ${err.message}`,
      childErr.stderr,
      childErr.stdout,
      childErr.code
    )
  }
}

/**
 * Reads a text-based resource file securely on demand.
 *
 * @param skillPath - The absolute path to the skill directory (security boundary)
 * @param resourceName - The name of the resource relative to the skill directory
 * @returns The content of the resource file
 */
export async function readResource(skillPath: string, resourceName: string): Promise<string> {
  // Security: Prevent Path Traversal
  const resourcePath = path.resolve(skillPath, resourceName)
  if (!resourcePath.startsWith(path.resolve(skillPath))) {
    throw new Error(
      'Security Violation: resourcePath resolves outside the skill directory boundary.'
    )
  }

  try {
    const content = await fs.readFile(resourcePath, 'utf8')
    return content
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read resource at ${resourcePath}: ${error.message}`)
    }
    throw error
  }
}
