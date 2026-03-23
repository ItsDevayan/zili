# Zili — AI-powered idea & task workflow

> Drop a `.txt` file. Get a BRD, design doc, structured task, AI context, and a Notion page. Powered by [Claude Code](https://claude.ai/download) — no API key needed.

---

## What is Zili?

Zili is a local workflow tool that turns raw, half-formed ideas and tasks into polished, structured documents using Claude. It watches folders, processes files automatically, and keeps your Notion database and project context files in sync.

**For ideas:**
- Evaluates whether an idea is worth pursuing
- Generates a full BRD + design spec for good ideas
- Moves weak ideas to a `dumped_ideas/` folder with a clear reason why

**For tasks:**
- Turns a one-liner into a structured task with acceptance criteria
- Generates an `ai_context` block — paste it into any AI coding assistant to get instant context
- Tracks complexity and priority

**Always:**
- Keeps a `CONTEXT.md` per project — one file to paste into Claude, Cursor, or any AI
- Keeps a `TASKS.md` per project and a `GLOBAL_TASKS.md` across all projects
- Syncs everything to Notion (optional)

---

## Prerequisites

- [Claude Code](https://claude.ai/download) installed (VS Code extension)
- Node.js 18+
- A Notion account (optional, for sync)

---

## Installation

```bash
git clone https://github.com/devayan/zili.git
cd zili
npm install
npm run setup    # interactive setup wizard
npm link         # makes 'zili' available globally
```

---

## Usage

### From the terminal (fastest)

```bash
zili idea "Add real-time GPS tracking to the fleet dashboard"
zili task "Implement JWT refresh token rotation in the auth service"
zili status      # see all projects and task counts
zili context     # regenerate CONTEXT.md and TASKS.md for all projects
```

### By dropping files (great for daemon mode)

```bash
zili start       # starts the file watcher
```

Then drop any `.txt` file into a project's `new_ideas/` or `new_tasks/` folder:

```bash
echo "A driver fatigue detection feature using the phone camera" \
  > ~/Desktop/my-project/new_ideas/fatigue-detection.txt
```

Zili picks it up automatically.

---

## What gets generated

### For a polished idea

```
my-project/
  polished_ideas/
    2026-03-23-fatigue-detection/
      original.txt     ← your raw input
      idea.md          ← refined description
      brd.md           ← full Business Requirements Document
      design.md        ← system design spec
      meta.json        ← metadata (title, verdict, timestamp)
```

### For a task

```
my-project/
  active_tasks/
    2026-03-23-jwt-refresh-rotation/
      original.txt     ← your raw input
      task.md          ← structured task with acceptance criteria
      context.md       ← AI context block (paste into Claude/Cursor)
      meta.json        ← metadata (complexity, priority, timestamp)
```

### Always generated

```
my-project/
  CONTEXT.md           ← full project context for AI (auto-updated)
  TASKS.md             ← current task board (auto-updated)

zili/
  GLOBAL_TASKS.md      ← tasks across all projects
```

---

## CONTEXT.md — your AI superpower

Every time you process an idea or task, Zili regenerates `CONTEXT.md` for that project. It looks like this:

```markdown
# My Project — AI Context Document

> Paste this into any AI coding assistant for instant project context.

## What is this project?
A fleet management SaaS with Node.js backend...

## Active Tasks (3)
### Implement JWT refresh rotation
- Complexity: M | Priority: high
...

## Quick AI Prompt Starter
You are helping me work on "My Project"...
```

**Paste this once at the start of any AI session** and the AI immediately understands your project, stack, and current priorities.

---

## Configuration

### config.json

```json
{
  "projects": [
    {
      "name": "My SaaS",
      "path": "~/Desktop/my-saas",
      "context": "A B2B SaaS with Next.js, Prisma, PostgreSQL. Multi-tenant."
    }
  ]
}
```

Paths support `~` (home directory). See `config.example.json` for more examples.

### Adding a new project

```bash
zili add
```

Or manually edit `config.json` and restart `zili start`.

### .env (Notion sync — optional)

```bash
cp .env.example .env
```

Then fill in your Notion token and database ID. See [Notion setup](#notion-setup) below.

---

## Notion setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **New integration** → give it a name → **Submit**
3. Copy the **Internal Integration Token** (starts with `ntn_...`)
4. In Notion, create a new **Database** page
5. Open the database → click `•••` → **Connections** → connect your integration
6. Copy the database ID from the URL (the part between `/` and `?`)
7. Add both to your `.env` file

Zili will automatically add `Status`, `Type`, `Project`, `Complexity`, and `Priority` columns to your database.

---

## Completing a task

When you finish a task, move its folder from `active_tasks/` to `done_tasks/`:

```bash
mv my-project/active_tasks/2026-03-23-my-task my-project/done_tasks/
zili context    # regenerate CONTEXT.md to reflect the update
```

---

## How it works

```
you drop a .txt
       ↓
  zili detects it (chokidar watcher)
       ↓
  claude -p "evaluate this..." (your local Claude Code session)
       ↓
  structured JSON response
       ↓
  saves files locally (polished/ or dumped/ or active_tasks/)
  regenerates CONTEXT.md + TASKS.md
  syncs to Notion (if configured)
       ↓
  done ✅
```

No external API calls from Zili itself — it uses the `claude` CLI that's already installed with Claude Code. Your subscription, your quota, no extra keys.

---

## Project structure

```
zili/
  bin/
    zili.js          ← CLI entry point
  src/
    watcher.js       ← file watcher daemon
    cli.js           ← terminal command handlers
    processor.js     ← calls claude CLI for ideas + tasks
    notion.js        ← Notion API integration
    context-generator.js ← generates CONTEXT.md + TASKS.md
    config.js        ← loads and resolves config.json
    setup.js         ← interactive setup wizard
    add-watch.js     ← add a project interactively
  config.example.json
  .env.example
  README.md
```

---

## Contributing

Pull requests welcome. Open an issue first for major changes.

---

## License

MIT
