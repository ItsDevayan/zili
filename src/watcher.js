/**
 * watcher.js — Ideas Workflow Daemon
 *
 * Watches new_ideas/ and new_tasks/ in every configured project.
 * Drop a .txt file → Claude evaluates → saves locally + syncs to Notion + updates CONTEXT.md
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./config');
const { processIdea, processTask } = require('./processor');
const { createIdeaPage, createTaskPage, ensureDatabaseProperties } = require('./notion');
const { updateProjectFiles, updateGlobalTasksFile } = require('./context-generator');

const GLOBAL_TASKS_FILE = path.join(__dirname, '../GLOBAL_TASKS.md');

// ─── Queue (process one at a time) ───────────────────────────────────────────

const queue = [];
let processing = false;

function enqueue(job) {
  queue.push(job);
  drain();
}

async function drain() {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue.shift();
  try {
    await job();
  } catch (err) {
    console.error('\n❌ Unhandled error:', err.message);
  }
  processing = false;
  drain();
}

// ─── Idea handler ─────────────────────────────────────────────────────────────

async function handleIdea(filePath, project) {
  await new Promise((r) => setTimeout(r, 300));
  if (!fs.existsSync(filePath)) return;

  const rawIdea = fs.readFileSync(filePath, 'utf-8').trim();
  const fileName = path.basename(filePath, '.txt');

  if (!rawIdea) {
    console.log(`⚠️  Skipping empty file: ${fileName}`);
    fs.unlinkSync(filePath);
    return;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`💡  New idea:  ${fileName}`);
  console.log(`🏷️   Project:  ${project.name}`);
  console.log(`🤖  Calling Claude...`);

  let result;
  try {
    result = await processIdea(rawIdea, project.name, project.context);
  } catch (err) {
    return moveToFailed(filePath, project.newIdeasDir, err.message);
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
      project: project.name, sourceFile: fileName, processedAt: new Date().toISOString(),
    }, null, 2));
    console.log(`✅  Polished  → ${outDir}`);
  } else {
    fs.mkdirSync(project.dumpedDir, { recursive: true });
    const dumpPath = path.join(project.dumpedDir, `${id}.md`);
    fs.writeFileSync(dumpPath,
      `# ${result.title}\n\n**Verdict**: Dumped  \n**Project**: ${project.name}  \n**Date**: ${today()}\n\n## Why\n\n${result.reason}\n\n---\n\n## Original Idea\n\n${rawIdea}\n`);
    console.log(`🗑️   Dumped   → ${dumpPath}`);
  }

  fs.unlinkSync(filePath);

  // Regenerate context files
  updateProjectFiles(project);
  console.log(`📄  CONTEXT.md + TASKS.md updated`);

  // Notion
  await syncNotion(() => createIdeaPage(result, project.name, rawIdea));

  console.log(`\n✅  Done: "${result.title}"\n`);
}

// ─── Task handler ─────────────────────────────────────────────────────────────

async function handleTask(filePath, project) {
  await new Promise((r) => setTimeout(r, 300));
  if (!fs.existsSync(filePath)) return;

  const rawTask = fs.readFileSync(filePath, 'utf-8').trim();
  const fileName = path.basename(filePath, '.txt');

  if (!rawTask) {
    console.log(`⚠️  Skipping empty file: ${fileName}`);
    fs.unlinkSync(filePath);
    return;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📌  New task:  ${fileName}`);
  console.log(`🏷️   Project:  ${project.name}`);
  console.log(`🤖  Calling Claude...`);

  let result;
  try {
    result = await processTask(rawTask, project.name, project.context);
  } catch (err) {
    return moveToFailed(filePath, project.newTasksDir, err.message);
  }

  const id = makeId(result.title);
  const outDir = path.join(project.activeTasksDir, id);
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, 'original.txt'), rawTask);
  fs.writeFileSync(
    path.join(outDir, 'task.md'),
    [
      `# ${result.title}`,
      ``,
      `**Complexity**: ${result.complexity} | **Priority**: ${result.priority}`,
      ``,
      `## Description`,
      ``,
      result.description,
      ``,
      `## Acceptance Criteria`,
      ``,
      (result.acceptance_criteria || []).map((c) => `- [ ] ${c}`).join('\n'),
      ``,
      `## Approach`,
      ``,
      result.approach,
      ``,
      `## Relevant Areas`,
      ``,
      (result.relevant_areas || []).map((a) => `- ${a}`).join('\n'),
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(outDir, 'context.md'),
    [
      `# AI Context — ${result.title}`,
      ``,
      `> Paste this into any AI coding assistant before starting this task.`,
      ``,
      result.ai_context,
      ``,
      `---`,
      ``,
      `**Project**: ${project.name}`,
      `**Task**: ${result.title}`,
      `**Complexity**: ${result.complexity} | **Priority**: ${result.priority}`,
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(outDir, 'meta.json'),
    JSON.stringify({
      title: result.title,
      complexity: result.complexity,
      priority: result.priority,
      description: result.description,
      acceptance_criteria: result.acceptance_criteria,
      relevant_areas: result.relevant_areas,
      project: project.name,
      sourceFile: fileName,
      createdAt: new Date().toISOString(),
    }, null, 2),
  );

  fs.unlinkSync(filePath);
  console.log(`📌  Task saved → ${outDir}`);

  // Regenerate context files
  updateProjectFiles(project);
  console.log(`📄  CONTEXT.md + TASKS.md updated`);

  // Notion
  await syncNotion(() => createTaskPage(result, project.name, rawTask));

  console.log(`\n✅  Task ready: "${result.title}" [${result.complexity}/${result.priority}]\n`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
  return `${today()}-${slug}`;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function moveToFailed(filePath, watchDir, reason) {
  const failedDir = path.join(watchDir, '_failed');
  fs.mkdirSync(failedDir, { recursive: true });
  fs.renameSync(filePath, path.join(failedDir, path.basename(filePath)));
  console.error(`❌  Claude failed: ${reason}`);
  console.error(`   → Moved to _failed/ for manual retry`);
}

async function syncNotion(fn) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
    console.log(`⚠️  Notion not configured — skipping sync`);
    return;
  }
  try {
    const url = await fn();
    console.log(`📋  Notion   → ${url}`);
  } catch (err) {
    console.error(`⚠️  Notion sync failed (local files OK): ${err.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();

  console.log('\n🚀  Ideas Workflow\n');
  console.log(`📁  Projects: ${config.projects.map((p) => p.name).join(', ')}\n`);

  // Ensure all directories exist
  for (const project of config.projects) {
    [
      project.newIdeasDir,
      project.newTasksDir,
      project.polishedDir,
      project.dumpedDir,
      project.activeTasksDir,
      project.doneTasksDir,
    ].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

    // Write initial context files if missing
    if (!fs.existsSync(project.contextFile)) updateProjectFiles(project);
  }

  // Initial global tasks
  updateGlobalTasksFile(config.projects, GLOBAL_TASKS_FILE);

  // Setup Notion schema
  if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
    try {
      await ensureDatabaseProperties();
      console.log('✅  Notion database ready');
    } catch (err) {
      console.error(`⚠️  Notion setup: ${err.message}`);
      console.error('   → Connect your integration to the database in Notion settings.\n');
    }
  } else {
    console.log('ℹ️  Notion not configured — running without sync');
  }

  // Start watchers for each project
  for (const project of config.projects) {
    // Ideas watcher
    chokidar
      .watch(path.join(project.newIdeasDir, '*.txt'), {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
      })
      .on('add', (fp) => {
        if (!fp.includes('_failed')) enqueue(() => handleIdea(fp, project));
      });

    // Tasks watcher
    chokidar
      .watch(path.join(project.newTasksDir, '*.txt'), {
        ignoreInitial: false,
        awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
      })
      .on('add', (fp) => {
        if (!fp.includes('_failed')) enqueue(() => handleTask(fp, project));
      });

    console.log(`👁️   ${project.name}`);
    console.log(`    Ideas → ${project.newIdeasDir}`);
    console.log(`    Tasks → ${project.newTasksDir}`);
  }

  console.log('\n📂  Drop a .txt file into any new_ideas/ or new_tasks/ folder.');
  console.log('    CTRL+C to stop.\n');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
