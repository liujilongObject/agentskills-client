# Agent Skills Client

A small but fully functional Node.js client SDK for integrating [Agent Skills](https://agentskills.io/) into AI agents and applications. Built with TypeScript, ensuring strict specification compliance and secure script execution.

## Features

- **🔍 Skill Discovery**: Automatically scan and discover valid skills in configured directories.
- **🛡️ Strict Metadata Validation**: Uses Zod to rigorously validate `SKILL.md` frontmatter against the official Agent Skills specification.
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

```bash
npm install agentskills-client
# or
pnpm add agentskills-client
# or
yarn add agentskills-client
```

## Quick Start

### 1. Discover and Load Skills

```typescript
import { discoverSkills, loadSkillMetadata, generateSkillsPrompt } from 'agentskills-client';

async function bootstrap() {
  // Find all valid skills in a directory
  const skillPaths = await discoverSkills('/path/to/my/skills/dir');

  // Load and validate metadata for all discovered skills
  const skillsInfo = await Promise.all(
    skillPaths.map(path => loadSkillMetadata(path))
  );

  // Inject this into your LLM's system prompt!
  const promptXml = generateSkillsPrompt(skillsInfo);
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

### `discoverSkills(directoryPath: string): Promise<string[]>`
Returns an array of absolute paths to discovered skill directories.

### `loadSkillMetadata(skillPath: string): Promise<SkillInfo>`
Parses and rigorously validates the `SKILL.md` frontmatter.

### `generateSkillsPrompt(skills: SkillInfo[], includeLocation?: boolean): string`
Generates the standard `<available_skills>` XML string for LLM injection.

### `activateSkill(skillPath: string): Promise<string>`
Returns the clean Markdown instruction body of the skill.

### `executeScript(skillPath: string, scriptName: string, options?: ExecutionOptions): Promise<ExecutionResult>`
Safely executes a script (`.js`, `.sh`, `.py`) located inside the skill directory.

### `readResource(skillPath: string, resourceName: string): Promise<string>`
Safely reads a text file located inside the skill directory.

## License

ISC
