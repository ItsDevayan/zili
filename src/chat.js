/**
 * chat.js — Zili interactive chatbot
 * Just type `zili` to start. Talk about anything.
 * Zili knows your projects, active tasks, and context.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const readline = require('readline');
const { spawn, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Colors ───────────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  magenta: '\x1b[35m',
  blue:    '\x1b[34m',
  gray:    '\x1b[90m',
  white:   '\x1b[97m',
};

const paint = (color, text) => `${c[color]}${text}${c.reset}`;

// ─── Find claude binary ───────────────────────────────────────────────────────

function findClaude() {
  try { execSync('which claude', { stdio: 'ignore' }); return 'claude'; } catch (_) {}
  const vscodeExts = path.join(os.homedir(), '.vscode', 'extensions');
  if (fs.existsSync(vscodeExts)) {
    const dirs = fs.readdirSync(vscodeExts).filter(d => d.startsWith('anthropic.claude-code'));
    for (const dir of dirs.sort().reverse()) {
      const bin = path.join(vscodeExts, dir, 'resources', 'native-binary', 'claude');
      if (fs.existsSync(bin)) return bin;
    }
  }
  throw new Error('Claude Code not found. Install it from https://claude.ai/download');
}

const CLAUDE_BIN = findClaude();

// ─── Build system context ─────────────────────────────────────────────────────

function buildSystemContext() {
  let projects = [];
  try {
    const { loadConfig } = require('./config');
    const config = loadConfig();
    projects = config.projects;
  } catch (_) {}

  const projectList = projects.map(p => {
    const activeTasks = readActiveTasks(p.activeTasksDir);
    return [
      `Project: ${p.name}`,
      `Context: ${p.context}`,
      activeTasks.length
        ? `Active tasks: ${activeTasks.map(t => `${t.title} (${t.complexity}/${t.priority})`).join(', ')}`
        : `Active tasks: none`,
    ].join('\n');
  }).join('\n\n');

  return `You are Zili, a personal AI assistant for a developer named Devayan.
You are friendly, sharp, and concise. You help with ideas, tasks, code, and general questions.
You also run a local workflow tool (also called Zili) that processes ideas and tasks into structured docs.

${projectList ? `Here are Devayan's current projects:\n\n${projectList}` : ''}

Keep responses concise unless asked for detail. Use plain text — no markdown formatting since this is a terminal.

IMPORTANT — when you need to run shell commands to complete a task:
- Wrap each command in a triple-backtick code block with "bash" or "sh" language tag
- After the user runs a command, you will receive the output automatically — use it to continue the task
- Keep issuing commands until the task is fully complete — do not stop halfway
- If a command fails, adapt and try a different approach

If Devayan asks about an idea or task, you can discuss it OR remind them they can run:
  zili idea "..."   to formally process and document an idea
  zili task "..."   to create a structured task with AI context`;
}

function readActiveTasks(activeTasksDir) {
  if (!activeTasksDir || !fs.existsSync(activeTasksDir)) return [];
  return fs.readdirSync(activeTasksDir)
    .filter(n => fs.existsSync(path.join(activeTasksDir, n, 'meta.json')))
    .map(n => JSON.parse(fs.readFileSync(path.join(activeTasksDir, n, 'meta.json'), 'utf-8')));
}

// ─── Build prompt from history ────────────────────────────────────────────────

function buildPrompt(systemContext, history) {
  const historyText = history.slice(-20)
    .map(m => {
      if (m.role === 'user') return `Devayan: ${m.content}`;
      if (m.role === 'assistant') return `Zili: ${m.content}`;
      if (m.role === 'system') return `[System: ${m.content}]`;
      return m.content;
    })
    .join('\n');
  return `${systemContext}\n\n--- Conversation ---\n${historyText}\n\nZili:`;
}

// ─── Call Claude ──────────────────────────────────────────────────────────────

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ['-p', prompt, '--output-format', 'json'], {
      env: { ...process.env },
    });

    let stdout = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Timed out after 3 minutes')); }, 180_000);

    proc.stdout.on('data', d => stdout += d.toString());
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('Claude failed'));
      try {
        let text = stdout;
        try { const o = JSON.parse(stdout); if (o.result) text = o.result; } catch (_) {}
        resolve(text.trim());
      } catch (e) { reject(e); }
    });
    proc.on('error', reject);
  });
}

// ─── Animated spinner ─────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerTimer = null;
let spinnerFrame = 0;

function startSpinner(msg = 'thinking') {
  spinnerFrame = 0;
  process.stdout.write('\n');
  spinnerTimer = setInterval(() => {
    process.stdout.write(`\r  ${c.magenta}${SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]}${c.reset}  ${c.gray}zili is ${msg}...${c.reset}`);
    spinnerFrame++;
  }, 80);
}

function stopSpinner() {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
  }
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

// ─── Shell command detection & execution ──────────────────────────────────────

function extractShellCommands(text) {
  const commands = [];
  const fenced = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
  let m;
  while ((m = fenced.exec(text)) !== null) {
    const cmd = m[1].trim();
    if (cmd) commands.push(cmd);
  }
  return commands;
}

function askQuestion(rl, question) {
  return new Promise(res => {
    rl.question(question, ans => res(ans.trim().toLowerCase()));
  });
}

// Run commands, capture output, return results for Claude to continue with
async function runCommands(commands, rl) {
  const results = [];

  for (const cmd of commands) {
    console.log(paint('cyan', `\n  ┌─ Run this command? ─────────────────────────`));
    cmd.split('\n').forEach(line => console.log(paint('white', `  │  ${line}`)));
    console.log(paint('cyan', `  └─────────────────────────────────────────────`));

    const answer = await askQuestion(rl, paint('yellow', '  Execute? (y/N): ') + c.reset);

    if (answer === 'y' || answer === 'yes') {
      console.log(paint('gray', '\n  Running...\n'));

      const result = spawnSync('bash', ['-c', cmd], {
        stdio: ['inherit', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });

      const stdout = result.stdout || '';
      const stderr = result.stderr || '';
      const combined = (stdout + stderr).trim();

      // Print output for the user to see
      if (combined) {
        combined.split('\n').forEach(line => console.log(paint('white', `  ${line}`)));
      }

      if (result.status === 0) {
        console.log(paint('green', '\n  ✓ Done.\n'));
      } else {
        console.log(paint('yellow', `\n  ⚠ Exited with code ${result.status}.\n`));
      }

      results.push({ cmd, output: combined, exitCode: result.status, ran: true });
    } else {
      console.log(paint('gray', '  Skipped.\n'));
      results.push({ cmd, ran: false });
    }
  }

  return results;
}

// ─── Agentic loop — keep going until Claude has no more commands ──────────────

async function agenticLoop(initialResponse, history, systemContext, rl) {
  let response = initialResponse;

  // Up to 10 rounds of command execution before stopping
  for (let round = 0; round < 10; round++) {
    const commands = extractShellCommands(response);
    if (commands.length === 0) break; // No commands — task complete

    const results = await runCommands(commands, rl);
    const anyRan = results.some(r => r.ran);
    if (!anyRan) break; // User skipped everything — stop

    // Build a context message with command results
    const resultSummary = results
      .filter(r => r.ran)
      .map(r => `$ ${r.cmd}\n[exit ${r.exitCode}]\n${r.output || '(no output)'}`)
      .join('\n\n');

    history.push({ role: 'system', content: `Command results:\n${resultSummary}` });

    // Ask Claude to continue
    startSpinner('continuing');
    try {
      response = await callClaude(buildPrompt(systemContext, history));
      stopSpinner();
    } catch (err) {
      stopSpinner();
      console.log(paint('yellow', `\n  ⚠ ${err.message}\n`));
      break;
    }

    history.push({ role: 'assistant', content: response });
    printResponse(response);
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function printBanner() {
  console.clear();
  console.log(paint('magenta', `
  ╔═══════════════════════════════════╗
  ║                                   ║
  ║   ✦  Z I L I                      ║
  ║      your personal AI             ║
  ║                                   ║
  ╚═══════════════════════════════════╝`));
  console.log(paint('gray', `  Type anything. /help for commands. /exit to quit.\n`));
}

function printHelp() {
  console.log(paint('cyan', `
  Commands:
    /clear      Clear the screen
    /context    Show your project context
    /tasks      Show active tasks
    /exit       Exit zili chat

  Or just type anything — Zili will respond.
  Shell commands in responses will be offered for execution,
  and Zili will continue the task automatically after each one.
`));
}

function printResponse(text) {
  const lines = text.split('\n');
  console.log();
  lines.forEach(line => {
    console.log(paint('white', `  ${line}`));
  });
  console.log();
}

// ─── Main chat loop ───────────────────────────────────────────────────────────

async function startChat() {
  printBanner();

  const systemContext = buildSystemContext();
  const history = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: paint('magenta', '  you › ') + c.white,
  });

  rl.prompt();

  rl.on('line', async (rawInput) => {
    const input = rawInput.trim();
    rl.pause();

    if (!input) { rl.resume(); rl.prompt(); return; }

    // Built-in commands
    if (input === '/exit' || input === '/quit') {
      console.log(paint('gray', '\n  See you later.\n'));
      process.exit(0);
    }
    if (input === '/clear') {
      printBanner();
      rl.resume(); rl.prompt(); return;
    }
    if (input === '/help') {
      printHelp();
      rl.resume(); rl.prompt(); return;
    }
    if (input === '/context') {
      console.log(paint('cyan', '\n' + systemContext.split('\n').map(l => `  ${l}`).join('\n') + '\n'));
      rl.resume(); rl.prompt(); return;
    }
    if (input === '/tasks') {
      try {
        const { loadConfig } = require('./config');
        const config = loadConfig();
        config.projects.forEach(p => {
          const tasks = readActiveTasks(p.activeTasksDir);
          console.log(paint('cyan', `\n  ${p.name} — ${tasks.length} active tasks`));
          tasks.forEach(t => console.log(paint('gray', `    • ${t.title} [${t.complexity}/${t.priority}]`)));
        });
        console.log();
      } catch (_) {}
      rl.resume(); rl.prompt(); return;
    }

    // Add to history and call Claude
    history.push({ role: 'user', content: input });

    startSpinner();

    try {
      const response = await callClaude(buildPrompt(systemContext, history));
      stopSpinner();
      history.push({ role: 'assistant', content: response });
      printResponse(response);

      // Run agentic loop — handles command execution + follow-up Claude calls
      await agenticLoop(response, history, systemContext, rl);

    } catch (err) {
      stopSpinner();
      console.log(paint('yellow', `\n  ⚠ ${err.message}\n`));
    }

    process.stdout.write(c.reset);
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    stopSpinner();
    console.log(paint('gray', '\n  See you later.\n'));
    process.exit(0);
  });
}

module.exports = { startChat };
