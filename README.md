# Agent Skills Client

A small but fully functional Node.js client SDK for integrating [Agent Skills](https://agentskills.io/) into AI agents and applications. Built with TypeScript, ensuring strict specification compliance and secure script execution.

## Features

- **🔍 Skill Discovery**: Automatically scan and discover valid skills in configured directories. Supports deep recursive scanning with smart ignore rules (e.g. `node_modules`, `.git`).
- **🛡️ Fault-Tolerant Metadata Validation**: Uses Zod to rigorously validate `SKILL.md` frontmatter against the official Agent Skills specification. Uses a robust diagnostic system instead of throwing fatal errors.
- **📄 Content Activation**: Cleanly strips YAML frontmatter to provide pure Markdown instructions to your LLMs.
- **🔐 Secure Execution Engine**:
  - Built-in path traversal prevention (sandboxed to the skill directory).
  - Cross-platform support for `.js`, `.py`, and `.sh` scripts.
  - Granular control over execution `cwd` and `env`.
  - Confirmation hooks (`onConfirm`) for user authorization before running risky scripts.
  - Custom auditing loggers to prevent stdout pollution.
- **💬 Prompt Generation**: Instantly generate `<available_skills>` XML blocks for system prompts.

## Installation

Ensure you are using Node.js >= 22.14.0.

### npm
```bash
npm install agentskills-client
```
### pnpm
```bash
pnpm add agentskills-client
```
### yarn
```bash
yarn add agentskills-client
```

## Quick Start

### 1. Discover and Load Skills

```typescript
import { discoverSkills, loadSkillMetadata, generateSkillsPrompt } from 'agentskills-client';

async function bootstrap() {
  // Find all valid skills in a directory (recursive by default)
  const skillPaths = await discoverSkills('/path/to/my/skills/dir', {
    recursive: true,
    ignoreDirs: ['node_modules', '.git', 'dist']
  });

  // Load and validate metadata for all discovered skills with fault tolerance
  const loadedSkills = await Promise.all(
    skillPaths.map(path => loadSkillMetadata(path))
  );

  // Filter out skills that failed validation, log warnings/errors
  const validSkills = [];
  for (const { skill, diagnostics } of loadedSkills) {
    if (diagnostics.length > 0) {
      console.warn('Diagnostics found:', diagnostics);
    }
    if (skill) {
      validSkills.push(skill);
    }
  }

  // Inject this into your LLM's system prompt!
  const promptXml = generateSkillsPrompt(validSkills);
  console.log(promptXml);
}
```

### 2. Activate a Skill

When an LLM decides to use a skill, load the full instructions:

```typescript
import { activateSkill } from 'agentskills-client';

// Returns the pure markdown body (without the YAML frontmatter)
const instructions = await activateSkill('/path/to/my/skills/dir/pdf-processing');
```

### 3. Securely Execute Scripts

When an LLM requests to run a script defined in the skill:

```typescript
import { executeScript, readResource } from 'agentskills-client';

async function runSkillTask() {
  const skillDir = '/path/to/my/skills/dir/pdf-processing';

  try {
    const result = await executeScript(skillDir, 'scripts/extract.py', {
      args: ['--input', 'doc.pdf'],
      cwd: process.cwd(), // Run in the user's current directory
      env: {
        ...process.env,
        API_KEY: 'your-secret-key'
      },
      // Ask user for permission before executing
      onConfirm: async (cmd, args) => {
        console.log(`LLM wants to run: ${cmd} ${args.join(' ')}`);
        return true; // Return false to abort
      },
      // Audit logs
      logger: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`)
      },
      timeout: 30000 // 30 second timeout
    });

    console.log("LLM output:", result.stdout);
    if (result.stderr) {
      console.warn("LLM warnings:", result.stderr);
    }
  } catch (error) {
    if (error.name === 'ExecutionError') {
      // Pass this back to the LLM so it can fix its mistake
      console.error('Exit code:', error.code);
      console.error('Stderr:', error.stderr);
    }
  }

  // Safe resource reading (prevents directory traversal attacks)
  const template = await readResource(skillDir, 'assets/template.md');
}
```

## API Reference

### Core Functions

| Function | Returns | Description |
| :--- | :--- | :--- |
| `discoverSkills(path, options?)` | `Promise<string[]>` | Recursively scans a directory and returns an array of absolute paths to discovered skill directories containing a `SKILL.md`. Configurable via `DiscoverSkillsOptions`. |
| `loadSkillMetadata(path)` | `Promise<LoadSkillResult>` | Parses and rigorously validates the `SKILL.md` frontmatter. Returns an object containing the `skill` (or `null` if fatal) and a `diagnostics` array for any warnings or errors. |
| `generateSkillsPrompt(skills, includeLocation?)` | `string` | Generates the standard `<available_skills>` XML string for LLM injection. |
| `activateSkill(path)` | `Promise<string>` | Reads the `SKILL.md` file and returns the clean Markdown instruction body (strips YAML frontmatter). |
| `executeScript(path, scriptName, options?)` | `Promise<ExecutionResult>` | Safely executes a script (`.js`, `.sh`, `.py`) located inside the skill directory. Prevents path traversal and supports advanced options like `onConfirm` and `timeout`. |
| `readResource(path, resourceName)` | `Promise<string>` | Safely reads a text file located inside the skill directory, blocking any directory traversal outside the skill's root. |

### Types & Interfaces

#### `DiscoverSkillsOptions`
Options for configuring how skills are discovered on the filesystem.
- **`recursive`** (`boolean`): Whether to scan subdirectories deeply. Default is `true`.
- **`ignoreDirs`** (`string[]`): Array of directory names to skip during scanning. Defaults to common noisy directories (`node_modules`, `.git`, `.venv`, `dist`, `build`, `.idea`).

#### `LoadSkillResult`
The result payload from metadata validation, enabling fault tolerance.
- **`skill`** (`SkillInfo | null`): The validated skill metadata, or `null` if validation failed completely.
- **`diagnostics`** (`SkillDiagnostic[]`): Array of warnings and errors encountered during parsing (e.g. name mismatch, invalid YAML).

#### `SkillDiagnostic`
- **`type`** (`'warning' | 'error'`): Severity level of the diagnostic.
- **`message`** (`string`): The description of what went wrong.
- **`path`** (`string`): The absolute path to the file that generated the diagnostic.

## License

ISC
