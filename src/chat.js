/**
 * chat.js — Zili interactive chatbot
 * Just type `zili` to start. Talk about anything.
 * Zili knows your projects, active tasks, and context.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const readline = require('readline');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Colors (no extra deps) ───────────────────────────────────────────────────

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

// ─── Build system context from config ────────────────────────────────────────

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

// ─── Call Claude ──────────────────────────────────────────────────────────────

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAUDE_BIN, ['-p', prompt, '--output-format', 'json'], {
      env: { ...process.env },
    });

    let stdout = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Timeout')); }, 60_000);

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
`));
}

function printThinking() {
  process.stdout.write(paint('gray', '  zili is thinking...'));
}

function clearThinking() {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
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
  const history = []; // { role: 'user'|'assistant', content: string }

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

    // Build full prompt with history
    history.push({ role: 'user', content: input });

    const historyText = history.slice(-10) // keep last 10 exchanges
      .map(m => `${m.role === 'user' ? 'Devayan' : 'Zili'}: ${m.content}`)
      .join('\n');

    const fullPrompt = `${systemContext}\n\n--- Conversation ---\n${historyText}\n\nZili:`;

    printThinking();

    try {
      const response = await callClaude(fullPrompt);
      clearThinking();
      history.push({ role: 'assistant', content: response });
      printResponse(response);
    } catch (err) {
      clearThinking();
      console.log(paint('yellow', `\n  ⚠ ${err.message}\n`));
    }

    process.stdout.write(c.reset);
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(paint('gray', '\n  See you later.\n'));
    process.exit(0);
  });
}

module.exports = { startChat };
