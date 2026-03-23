#!/usr/bin/env node
/**
 * zili — AI-powered idea & task workflow CLI
 *
 * Usage:
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

const COMMANDS = ['start', 'idea', 'task', 'add', 'context', 'status', 'help'];

if (!command || command === 'help' || command === '--help' || command === '-h') {
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
}

function printHelp() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  zili — AI-powered idea & task workflow      ║
  ╚══════════════════════════════════════════════╝

  Commands:
    zili start              Start the file watcher daemon
    zili idea "..."         Process an idea from the terminal
    zili task "..."         Create a structured task from the terminal
    zili add                Add a new project to watch
    zili context            Regenerate CONTEXT.md + TASKS.md for all projects
    zili status             Show projects and active task counts
    zili help               Show this help

  Examples:
    zili idea "Add real-time GPS tracking to the fleet dashboard"
    zili task "Implement JWT refresh token rotation in the auth service"
    zili start              (then drop .txt files into any new_ideas/ or new_tasks/)

  Docs: https://github.com/devayan/zili
`);
}
