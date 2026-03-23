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

const SESSIONS_DIR = path.join(os.homedir(), '.zili', 'sessions');

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

IMPORTANT — shell command execution works like this:
- Wrap commands in triple-backtick bash/sh blocks so they can be executed
- After execution, you will receive a message starting with "COMMAND RESULTS:" showing exactly what ran and what the output was
- When you see COMMAND RESULTS, you already have the data — DO NOT ask for the same command again
- Continue the task using the results you received
- Keep issuing new commands as needed until the task is fully complete

If Devayan asks about an idea or task, you can discuss it OR remind them they can run:
  zili idea "..."   to formally process and document an idea
  zili task "..."   to create a structured task with AI context${loadRecentSessions()}`;
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
      return m.content; // raw — used for COMMAND RESULTS blocks
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

// ─── Shell command detection ──────────────────────────────────────────────────

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

// ─── Yes/No prompt — uses a fresh rl so it doesn't corrupt the main one ───────

function promptYesNo(question) {
  return new Promise(res => {
    process.stdout.write(question);
    const tmp = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
    tmp.once('line', line => {
      tmp.close();
      const ans = line.trim().toLowerCase();
      res(ans === 'y' || ans === 'yes');
    });
  });
}

// ─── Run commands, capture output, return results ─────────────────────────────

async function runCommands(commands, ranBefore) {
  const results = [];

  for (const cmd of commands) {
    // Skip if we already ran this exact command (avoid infinite loops)
    if (ranBefore.has(cmd)) {
      results.push({ cmd, ran: false, skipped: 'already ran' });
      continue;
    }

    process.stdout.write(paint('cyan', `\n  ┌─ Run this command? ─────────────────────────\n`));
    cmd.split('\n').forEach(line => process.stdout.write(paint('white', `  │  ${line}\n`)));
    process.stdout.write(paint('cyan', `  └─────────────────────────────────────────────\n`));

    const confirmed = await promptYesNo(paint('yellow', '  Execute? (y/N): ') + c.reset);

    if (confirmed) {
      process.stdout.write(paint('gray', '\n  Running...\n\n'));
      ranBefore.add(cmd);

      const result = spawnSync('bash', ['-c', cmd], {
        stdio: ['inherit', 'pipe', 'pipe'],
        encoding: 'utf-8',
      });

      const combined = ((result.stdout || '') + (result.stderr || '')).trim();

      if (combined) {
        combined.split('\n').forEach(line => process.stdout.write(paint('white', `  ${line}\n`)));
      }

      if (result.status === 0) {
        process.stdout.write(paint('green', '\n  ✓ Done.\n\n'));
      } else {
        process.stdout.write(paint('yellow', `\n  ⚠ Exited with code ${result.status}.\n\n`));
      }

      results.push({ cmd, output: combined, exitCode: result.status, ran: true });
    } else {
      process.stdout.write(paint('gray', '  Skipped.\n\n'));
      results.push({ cmd, ran: false });
    }
  }

  return results;
}

// ─── Agentic loop — keeps going until Claude issues no more commands ───────────

async function agenticLoop(initialResponse, history, systemContext) {
  const ranBefore = new Set(); // deduplicate commands across rounds
  let response = initialResponse;

  for (let round = 0; round < 10; round++) {
    const commands = extractShellCommands(response);
    if (commands.length === 0) break;

    const results = await runCommands(commands, ranBefore);
    const ran = results.filter(r => r.ran);
    if (ran.length === 0) break; // user skipped everything

    // Build a clear result block that Claude can't misread
    const resultBlock = ran
      .map(r => `$ ${r.cmd}\n--- output (exit ${r.exitCode}) ---\n${r.output || '(no output)'}`)
      .join('\n\n');

    // Push as a raw history entry (not prefixed with Devayan/Zili)
    history.push({
      role: 'raw',
      content: `COMMAND RESULTS:\n${resultBlock}\n\nPlease continue the task using the above output.`,
    });

    startSpinner('continuing');
    try {
      response = await callClaude(buildPrompt(systemContext, history));
    } catch (err) {
      stopSpinner();
      process.stdout.write(paint('yellow', `\n  ⚠ ${err.message}\n\n`));
      break;
    }
    stopSpinner();

    history.push({ role: 'assistant', content: response });
    printResponse(response);
  }
}

// ─── Session memory ───────────────────────────────────────────────────────────

function loadRecentSessions() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return '';
    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 3); // last 3 sessions
    if (files.length === 0) return '';
    const summaries = files.map(f => fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8')).join('\n\n---\n\n');
    return `\n\nRECENT SESSION MEMORY (use this to maintain continuity):\n${summaries}`;
  } catch (_) {
    return '';
  }
}

async function saveSessionSummary(history) {
  // Only save if there was actual conversation (at least 2 exchanges)
  const exchanges = history.filter(m => m.role === 'user' || m.role === 'assistant');
  if (exchanges.length < 2) return;

  const convo = exchanges
    .map(m => `${m.role === 'user' ? 'Devayan' : 'Zili'}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `Summarize this Zili chat session in plain text. Include:
- What the user asked about or worked on
- What was accomplished or decided
- Any shell commands run and their purpose/outcome
- Anything left pending or to follow up on
- Any preferences or patterns noticed about how the user works

Keep it under 250 words. Write in present/past tense as a session log, not as instructions.

SESSION:
${convo}`;

  try {
    const summary = await callClaude(summaryPrompt);
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${stamp}-session.md`;

    const content = `# Zili Session — ${now.toLocaleString()}\n\n${summary}\n`;
    fs.writeFileSync(path.join(SESSIONS_DIR, filename), content);
  } catch (_) {
    // Silent fail — don't interrupt exit on summary errors
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
  Shell commands in responses are offered for execution.
  Zili continues the task automatically after each one runs.
`));
}

function printResponse(text) {
  process.stdout.write('\n');
  text.split('\n').forEach(line => {
    process.stdout.write(paint('white', `  ${line}\n`));
  });
  process.stdout.write('\n');
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
    process.stdout.write(c.reset);

    if (!input) { rl.resume(); rl.prompt(); return; }

    // Built-in commands
    if (input === '/exit' || input === '/quit') {
      process.stdout.write(paint('gray', '\n  Saving session...\n'));
      await saveSessionSummary(history);
      process.stdout.write(paint('gray', '  See you later.\n\n'));
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
      process.stdout.write('\n' + systemContext.split('\n').map(l => paint('cyan', `  ${l}`)).join('\n') + '\n\n');
      rl.resume(); rl.prompt(); return;
    }
    if (input === '/tasks') {
      try {
        const { loadConfig } = require('./config');
        const config = loadConfig();
        config.projects.forEach(p => {
          const tasks = readActiveTasks(p.activeTasksDir);
          process.stdout.write(paint('cyan', `\n  ${p.name} — ${tasks.length} active tasks\n`));
          tasks.forEach(t => process.stdout.write(paint('gray', `    • ${t.title} [${t.complexity}/${t.priority}]\n`)));
        });
        process.stdout.write('\n');
      } catch (_) {}
      rl.resume(); rl.prompt(); return;
    }

    history.push({ role: 'user', content: input });

    startSpinner();

    try {
      const response = await callClaude(buildPrompt(systemContext, history));
      stopSpinner();
      history.push({ role: 'assistant', content: response });
      printResponse(response);

      // Agentic loop: handles commands + Claude follow-ups until task is done
      await agenticLoop(response, history, systemContext);

    } catch (err) {
      stopSpinner();
      process.stdout.write(paint('yellow', `\n  ⚠ ${err.message}\n\n`));
    }

    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    stopSpinner();
    process.stdout.write(paint('gray', '\n  Saving session...\n'));
    saveSessionSummary(history).finally(() => {
      process.stdout.write(paint('gray', '  See you later.\n\n'));
      process.exit(0);
    });
  });
}

module.exports = { startChat };
