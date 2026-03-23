/**
 * setup.js — Interactive first-time setup for Zili
 * Run: node src/setup.js  OR  npm run setup
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const os = require('os');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const ENV_PATH = path.join(__dirname, '../.env');
const CONFIG_PATH = path.join(__dirname, '../config.json');

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║  Zili Setup                                  ║
  ╚══════════════════════════════════════════════╝
  `);

  // ── Notion setup ────────────────────────────────────────────────────────────
  console.log('Step 1 — Notion (optional but recommended)\n');
  console.log('  To sync ideas and tasks to Notion:');
  console.log('  1. Go to https://www.notion.so/my-integrations');
  console.log('  2. Create a new integration → copy the token (starts with ntn_...)');
  console.log('  3. Create a new Database page in Notion');
  console.log('  4. Open the database → ••• menu → Connections → connect your integration');
  console.log('  5. Copy the database ID from the URL (the part before the ?)');
  console.log();

  const notionToken = (await ask('  Notion token (leave blank to skip): ')).trim();
  let notionDbId = '';
  if (notionToken) {
    notionDbId = (await ask('  Notion database ID: ')).trim();
  }

  // ── Projects setup ───────────────────────────────────────────────────────────
  console.log('\nStep 2 — Add your first project\n');

  const projects = [];
  let addMore = true;

  while (addMore) {
    const projPath = (await ask('  Project folder path (e.g. ~/Desktop/my-project): ')).trim();
    const projName = (await ask('  Project name (e.g. "My SaaS"): ')).trim();
    const projContext = (
      await ask('  One-line project description for Claude (what it is, stack, purpose):\n  ')
    ).trim();

    projects.push({ name: projName, path: projPath, context: projContext });

    const more = (await ask('\n  Add another project? (y/N): ')).trim().toLowerCase();
    addMore = more === 'y' || more === 'yes';
  }

  // ── Write .env ───────────────────────────────────────────────────────────────
  const envLines = [
    notionToken ? `NOTION_TOKEN=${notionToken}` : '# NOTION_TOKEN=your_token_here',
    notionDbId ? `NOTION_DATABASE_ID=${notionDbId}` : '# NOTION_DATABASE_ID=your_database_id',
  ];
  fs.writeFileSync(ENV_PATH, envLines.join('\n') + '\n');

  // ── Write config.json ────────────────────────────────────────────────────────
  const config = { projects };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  // ── Make bin executable ──────────────────────────────────────────────────────
  const binPath = path.join(__dirname, '../bin/zili.js');
  try {
    fs.chmodSync(binPath, '755');
  } catch (_) {}

  console.log(`
  ✅  Setup complete!

  Run Zili:
    npm link          (makes 'zili' available globally)
    zili start        (start the file watcher)

  Or without npm link:
    node bin/zili.js start

  Commands:
    zili idea "your idea"   → evaluate + polish or dump
    zili task "your task"   → create structured task + AI context
    zili status             → see all projects and task counts
    zili add                → add another project later
  `);

  rl.close();
}

main().catch((err) => {
  console.error(err.message);
  rl.close();
  process.exit(1);
});
