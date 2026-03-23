/**
 * add-watch.js
 * Interactive helper to add a new project directory to config.json
 * Usage: node src/add-watch.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, '../config.json');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  console.log('\n➕  Add a new project to watch\n');

  const projectPath = (await ask('Project folder path (e.g. /home/devayan/Desktop/my-project): ')).trim();
  const context = (await ask('Context label for Claude (e.g. "My Side Project"): ')).trim();

  const newEntry = {
    path: path.join(projectPath, 'new_ideas'),
    context,
    polished: path.join(projectPath, 'polished_ideas'),
    dumped: path.join(projectPath, 'dumped'),
  };

  // Create the directories
  [newEntry.path, newEntry.polished, newEntry.dumped].forEach((d) =>
    fs.mkdirSync(d, { recursive: true }),
  );

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  config.watched.push(newEntry);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log(`\n✅  Added! Restart the watcher to pick up the new directory.`);
  console.log(`   Drop ideas into: ${newEntry.path}\n`);
  rl.close();
}

main().catch((err) => {
  console.error(err.message);
  rl.close();
  process.exit(1);
});
