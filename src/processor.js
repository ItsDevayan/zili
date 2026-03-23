/**
 * processor.js
 * Evaluates raw idea text using the local `claude` CLI (Claude Code).
 * No separate API key — uses your existing Claude Code session.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TIMEOUT_MS = 120_000; // 2 minutes

// ─── Find claude binary ───────────────────────────────────────────────────────

function findClaudeBinary() {
  // 1. Already in PATH?
  try {
    execSync('which claude', { stdio: 'ignore' });
    return 'claude';
  } catch (_) {}

  // 2. VS Code extension (Linux/macOS)
  const vscodeExts = path.join(process.env.HOME || os.homedir(), '.vscode', 'extensions');
  if (fs.existsSync(vscodeExts)) {
    const dirs = fs.readdirSync(vscodeExts).filter((d) => d.startsWith('anthropic.claude-code'));
    for (const dir of dirs.sort().reverse()) {
      const candidate = path.join(vscodeExts, dir, 'resources', 'native-binary', 'claude');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 3. Cursor extension
  const cursorExts = path.join(process.env.HOME || '', '.cursor', 'extensions');
  if (fs.existsSync(cursorExts)) {
    const dirs = fs.readdirSync(cursorExts).filter((d) => d.startsWith('anthropic.claude-code'));
    for (const dir of dirs.sort().reverse()) {
      const candidate = path.join(cursorExts, dir, 'resources', 'native-binary', 'claude');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    'Could not find the claude binary.\n' +
      'Install Claude Code: https://claude.ai/download\n' +
      'Or add it to your PATH manually.',
  );
}

const CLAUDE_BIN = findClaudeBinary();

// ─── Idea processor ───────────────────────────────────────────────────────────

function buildIdeaPrompt(rawIdea, projectName, projectContext) {
  return `You are a sharp product strategist evaluating an idea for a project called "${projectName}".

Project context: ${projectContext}

Raw idea submitted:
---
${rawIdea}
---

Evaluate and reply with ONLY a valid JSON object — no markdown fences, no extra text:

{
  "verdict": "polish" or "dump",
  "title": "Short punchy title (3–6 words)",
  "reason": "2–3 sentences explaining your verdict clearly",
  "polished_idea": "If verdict=polish: Refined 2–3 paragraph description. Empty string if dump.",
  "brd": "If verdict=polish: Full BRD in markdown. Sections: Overview, Problem Statement, Goals, User Stories, Functional Requirements, Non-Functional Requirements, Success Metrics. Empty string if dump.",
  "design": "If verdict=polish: Design spec in markdown. Sections: Architecture Overview, Key Components, Data Models, API Design, UI/UX Notes, Implementation Phases. Empty string if dump."
}

Polish if: novel enough, feasible, genuinely valuable, fits the project context.
Dump if: too vague, already well-solved, infeasible, or irrelevant to this project.`;
}

async function processIdea(rawIdea, projectName, projectContext) {
  return callClaude(buildIdeaPrompt(rawIdea, projectName, projectContext));
}

// ─── Task processor ───────────────────────────────────────────────────────────

function buildTaskPrompt(rawTask, projectName, projectContext) {
  return `You are a senior engineering lead breaking down a development task for "${projectName}".

Project context: ${projectContext}

Raw task submitted:
---
${rawTask}
---

Reply with ONLY a valid JSON object — no markdown fences, no extra text:

{
  "title": "Clear task title (5–10 words)",
  "complexity": "XS" or "S" or "M" or "L" or "XL",
  "priority": "low" or "medium" or "high" or "critical",
  "description": "2–3 paragraph clear description of what needs to be done and why",
  "acceptance_criteria": ["Criterion 1", "Criterion 2", "Criterion 3"],
  "approach": "Step-by-step implementation approach in markdown (2–3 sections with bullet points)",
  "relevant_areas": ["file/module/area 1", "file/module/area 2"],
  "ai_context": "A self-contained context paragraph an AI coding assistant would need to implement this task. Include: what the task is, how it fits the project, key constraints, suggested patterns, and anything a new developer would need to know."
}`;
}

async function processTask(rawTask, projectName, projectContext) {
  return callClaude(buildTaskPrompt(rawTask, projectName, projectContext));
}

// ─── Shared CLI runner ────────────────────────────────────────────────────────

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ['-p', prompt, '--output-format', 'json'], {
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Timed out waiting for Claude CLI (>2 min)'));
    }, TIMEOUT_MS);

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`claude CLI exited ${code}: ${stderr.slice(0, 300)}`));
      }

      try {
        // --output-format json wraps response in { result: "..." }
        let text = stdout;
        try {
          const outer = JSON.parse(stdout);
          if (outer.result) text = outer.result;
        } catch (_) {}

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Claude response');

        resolve(JSON.parse(jsonMatch[0]));
      } catch (err) {
        reject(
          new Error(
            `Parse error: ${err.message}\n\nRaw output (first 500 chars):\n${stdout.slice(0, 500)}`,
          ),
        );
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });
  });
}

module.exports = { processIdea, processTask };
