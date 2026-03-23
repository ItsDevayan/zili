/**
 * cli.js
 * Handles direct terminal commands: zili idea / zili task / zili context / zili status
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');
const os = require('os');

const { loadConfig } = require('./config');
const { processIdea, processTask } = require('./processor');
const { createIdeaPage, createTaskPage, ensureDatabaseProperties } = require('./notion');
const { updateProjectFiles, updateGlobalTasksFile } = require('./context-generator');

const GLOBAL_TASKS_FILE = path.join(__dirname, '../GLOBAL_TASKS.md');

// ─── zili idea "..." ──────────────────────────────────────────────────────────

async function runIdea(rawIdea) {
  const config = loadConfig();
  const project = await pickProject(config.projects, 'idea');

  console.log(`\n💡  Processing idea for: ${project.name}`);
  console.log(`🤖  Calling Claude...\n`);

  let result;
  try {
    result = await processIdea(rawIdea, project.name, project.context);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  const isPolished = result.verdict === 'polish';
  const id = makeId(result.title);

  if (isPolished) {
    const outDir = path.join(project.polishedDir, id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'original.txt'), rawIdea);
    fs.writeFileSync(path.join(outDir, 'idea.md'), `# ${result.title}\n\n${result.polished_idea}\n`);
    fs.writeFileSync(path.join(outDir, 'brd.md'), result.brd);
    fs.writeFileSync(path.join(outDir, 'design.md'), result.design);
    fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
      title: result.title, verdict: 'polish', reason: result.reason,
      project: project.name, processedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`✅  Polished → ${outDir}`);
  } else {
    fs.mkdirSync(project.dumpedDir, { recursive: true });
    const dumpPath = path.join(project.dumpedDir, `${id}.md`);
    fs.writeFileSync(dumpPath,
      `# ${result.title}\n\n**Verdict**: Dumped\n**Reason**: ${result.reason}\n\n---\n\n${rawIdea}\n`);
    console.log(`🗑️   Dumped → ${dumpPath}`);
  }

  updateProjectFiles(project);

  if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
    try {
      await ensureDatabaseProperties();
      const url = await createIdeaPage(result, project.name, rawIdea);
      console.log(`📋  Notion → ${url}`);
    } catch (err) {
      console.error(`⚠️  Notion: ${err.message}`);
    }
  }

  console.log(`\n✅  "${result.title}" — ${isPolished ? 'polished' : 'dumped'}\n`);
}

// ─── zili task "..." ──────────────────────────────────────────────────────────

async function runTask(rawTask) {
  const config = loadConfig();
  const project = await pickProject(config.projects, 'task');

  console.log(`\n📌  Processing task for: ${project.name}`);
  console.log(`🤖  Calling Claude...\n`);

  let result;
  try {
    result = await processTask(rawTask, project.name, project.context);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  const id = makeId(result.title);
  const outDir = path.join(project.activeTasksDir, id);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'original.txt'), rawTask);
  fs.writeFileSync(path.join(outDir, 'task.md'), buildTaskMd(result));
  fs.writeFileSync(path.join(outDir, 'context.md'), buildContextMd(result, project));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    title: result.title, complexity: result.complexity, priority: result.priority,
    description: result.description, acceptance_criteria: result.acceptance_criteria,
    relevant_areas: result.relevant_areas, project: project.name,
    createdAt: new Date().toISOString(),
  }, null, 2));

  updateProjectFiles(project);
  updateGlobalTasksFile(config.projects, GLOBAL_TASKS_FILE);

  if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
    try {
      await ensureDatabaseProperties();
      const url = await createTaskPage(result, project.name, rawTask);
      console.log(`📋  Notion → ${url}`);
    } catch (err) {
      console.error(`⚠️  Notion: ${err.message}`);
    }
  }

  console.log(`\n✅  Task: "${result.title}" [${result.complexity} / ${result.priority}]`);
  console.log(`   context.md → ${path.join(outDir, 'context.md')}\n`);
}

// ─── zili context ─────────────────────────────────────────────────────────────

async function regenerateAll() {
  const config = loadConfig();

  for (const project of config.projects) {
    updateProjectFiles(project);
    console.log(`✅  ${project.name} → CONTEXT.md + TASKS.md updated`);
  }

  updateGlobalTasksFile(config.projects, GLOBAL_TASKS_FILE);
  console.log(`✅  GLOBAL_TASKS.md updated\n`);
}

// ─── zili status ─────────────────────────────────────────────────────────────

function showStatus() {
  const config = loadConfig();

  console.log(`\n  Zili — Project Status\n  ${'─'.repeat(40)}`);

  for (const project of config.projects) {
    const active = countTasks(project.activeTasksDir);
    const done = countTasks(project.doneTasksDir);
    const polished = countDirs(project.polishedDir);
    const dumped = countFiles(project.dumpedDir, '.md');

    console.log(`\n  📁  ${project.name}`);
    console.log(`      Active tasks:    ${active}`);
    console.log(`      Done tasks:      ${done}`);
    console.log(`      Polished ideas:  ${polished}`);
    console.log(`      Dumped ideas:    ${dumped}`);
  }

  console.log();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pickProject(projects, type) {
  if (projects.length === 1) return projects[0];

  // If only one project matches obvious defaults, use it
  // Otherwise prompt the user
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(`\nWhich project is this ${type} for?\n`);
  projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
  console.log();

  return new Promise((resolve) => {
    rl.question('Enter number: ', (ans) => {
      rl.close();
      const idx = parseInt(ans.trim(), 10) - 1;
      if (idx >= 0 && idx < projects.length) {
        resolve(projects[idx]);
      } else {
        console.error('Invalid selection');
        process.exit(1);
      }
    });
  });
}

function makeId(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  return `${new Date().toISOString().split('T')[0]}-${slug}`;
}

function buildTaskMd(r) {
  return [
    `# ${r.title}`,
    ``,
    `**Complexity**: ${r.complexity} | **Priority**: ${r.priority}`,
    ``,
    `## Description`,
    ``,
    r.description,
    ``,
    `## Acceptance Criteria`,
    ``,
    (r.acceptance_criteria || []).map((c) => `- [ ] ${c}`).join('\n'),
    ``,
    `## Approach`,
    ``,
    r.approach,
    ``,
    `## Relevant Areas`,
    ``,
    (r.relevant_areas || []).map((a) => `- ${a}`).join('\n'),
  ].join('\n');
}

function buildContextMd(r, project) {
  return [
    `# AI Context — ${r.title}`,
    ``,
    `> Paste this into any AI coding assistant before starting this task.`,
    ``,
    r.ai_context,
    ``,
    `---`,
    ``,
    `**Project**: ${project.name}`,
    `**Task**: ${r.title}`,
    `**Complexity**: ${r.complexity} | **Priority**: ${r.priority}`,
  ].join('\n');
}

function countTasks(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'meta.json'))).length;
}

function countDirs(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).length;
}

function countFiles(dir, ext) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => n.endsWith(ext)).length;
}

module.exports = { runIdea, runTask, regenerateAll, showStatus };
