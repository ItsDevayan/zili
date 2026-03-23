/**
 * config.js
 * Loads config.json and resolves paths (expands ~ to home directory).
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '../config.json');

function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌  config.json not found. Run ./setup.sh first.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

  // Resolve paths in each project
  const projects = (raw.projects || []).map((proj) => ({
    ...proj,
    path: expandPath(proj.path),
    // Derived subdirectory paths
    newIdeasDir: path.join(expandPath(proj.path), 'new_ideas'),
    newTasksDir: path.join(expandPath(proj.path), 'new_tasks'),
    polishedDir: path.join(expandPath(proj.path), 'polished_ideas'),
    dumpedDir: path.join(expandPath(proj.path), 'dumped_ideas'),
    activeTasksDir: path.join(expandPath(proj.path), 'active_tasks'),
    doneTasksDir: path.join(expandPath(proj.path), 'done_tasks'),
    contextFile: path.join(expandPath(proj.path), 'CONTEXT.md'),
    tasksFile: path.join(expandPath(proj.path), 'TASKS.md'),
  }));

  return { ...raw, projects };
}

module.exports = { loadConfig, expandPath };
