#!/usr/bin/env node
/**
 * zili — AI-powered idea & task workflow + personal chatbot
 *
 * Usage:
 *   zili                    Start interactive chat with Zili
 *   zili start              Start the file watcher daemon
 *   zili idea "your idea"   Process an idea directly from the terminal
 *   zili task "your task"   Process a task directly from the terminal
 *   zili add                Add a new project to watch
 *   zili context            Regenerate CONTEXT.md + TASKS.md for all projects
 *   zili status             Show all projects and active task counts
 */

process.title = 'zili';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const command = process.argv[2];
const rest = process.argv.slice(3).join(' ').trim();

const COMMANDS = ['start', 'idea', 'task', 'add', 'context', 'status', 'help', 'chat', 'theme'];

// No command → start chat
if (!command || command === 'chat') {
  require('../src/chat').startChat();
  return;
}

if (command === 'help' || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (!COMMANDS.includes(command)) {
  console.error(`\n❌  Unknown command: "${command}"`);
  printHelp();
  process.exit(1);
}

switch (command) {
  case 'start':
    require('../src/watcher');
    break;

  case 'idea':
    if (!rest) {
      console.error('❌  Provide your idea: zili idea "your idea text here"');
      process.exit(1);
    }
    require('../src/cli').runIdea(rest);
    break;

  case 'task':
    if (!rest) {
      console.error('❌  Provide your task: zili task "what needs to be done"');
      process.exit(1);
    }
    require('../src/cli').runTask(rest);
    break;

  case 'add':
    require('../src/add-watch');
    break;

  case 'context':
    require('../src/cli').regenerateAll();
    break;

  case 'status':
    require('../src/cli').showStatus();
    break;

  case 'theme':
    require('../src/theme').runTheme();
    break;
}

function printHelp() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  zili — AI workflow + personal assistant     ║
  ╚══════════════════════════════════════════════╝

  Chat:
    zili                    Start chatting with Zili (default)

  Workflow:
    zili idea "..."         Process an idea — get BRD + design doc
    zili task "..."         Create a structured task with AI context
    zili start              Start the file watcher daemon
    zili add                Add a new project to watch
    zili context            Regenerate CONTEXT.md + TASKS.md
    zili status             Show projects and task counts

  System:
    zili theme              Beautify your Ubuntu (Dracula, Papirus, fonts, prompt)
    zili help               Show this help

  Examples:
    zili
    zili idea "A smart notification system for my app"
    zili task "Add dark mode toggle to the settings page"
    zili theme

  Docs: https://github.com/ItsDevayan/zili
`);
}
