# Zili — AI workflow + personal assistant 🦑

> Your personal AI in the terminal. Process ideas into BRDs, turn tasks into structured docs with AI context, and chat about anything. Powered by [Claude Code](https://claude.ai/download) — no API key needed.

---

## What is Zili?

Zili is a local CLI tool that sits between you and Claude. It does two things:

**1. Chatbot** — just type `zili` and talk. It knows your projects, your active tasks, and your context.

**2. Workflow** — drop a raw idea or task as a `.txt` file (or type it directly), and Zili turns it into:
- A full BRD + design spec (for ideas worth pursuing)
- A structured task with acceptance criteria and an AI context block
- A Notion page (optional)
- An auto-updated `CONTEXT.md` you can paste into any AI coding session

---

## Prerequisites

- [Claude Code](https://claude.ai/download) (VS Code or Cursor extension)
- Node.js 18+
- Notion account (optional, for sync)

---

## Installation

```bash
git clone https://github.com/ItsDevayan/zili.git
cd zili
npm install
npm run setup    # interactive setup — adds your projects
npm link         # makes 'zili' available globally
```

If `zili` isn't found after `npm link`, add npm's global bin to your PATH:

```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## Usage

### Chat with Zili

```bash
zili
```

Just start talking. Zili knows your projects and tasks. Type `/help` inside chat for commands.

### Process an idea

```bash
zili idea "A smart notification batching system to reduce alert fatigue"
```

Zili evaluates it. If worth pursuing → generates BRD + design doc + Notion page. If not → explains why and files it as dumped.

### Create a structured task

```bash
zili task "Add dark mode toggle to the settings page"
```

Generates a task with: description, acceptance criteria, implementation approach, relevant files, and an **AI context block** you paste into Claude/Cursor to get instant context.

### File watcher (daemon mode)

```bash
zili start
```

Then drop `.txt` files into any project's `new_ideas/` or `new_tasks/` folder — Zili processes them automatically.

### Other commands

```bash
zili status      # see all projects and task counts
zili context     # regenerate CONTEXT.md + TASKS.md for all projects
zili add         # add a new project to watch
```

---

## What gets generated

### For a polished idea

```
my-project/
  polished_ideas/
    2026-03-23-smart-notifications/
      original.txt     ← your raw input
      idea.md          ← refined description
      brd.md           ← full Business Requirements Document
      design.md        ← system design spec
      meta.json
```

### For a task

```
my-project/
  active_tasks/
    2026-03-23-dark-mode-toggle/
      original.txt     ← your raw input
      task.md          ← structured task with acceptance criteria
      context.md       ← AI context block (paste into Claude/Cursor)
      meta.json
```

### Always generated (per project)

```
my-project/
  CONTEXT.md           ← full project context for AI (auto-updated)
  TASKS.md             ← current task board (auto-updated)

zili/
  GLOBAL_TASKS.md      ← tasks across all your projects
```

---

## CONTEXT.md — paste this into any AI

Every time you process an idea or task, Zili regenerates `CONTEXT.md`:

```markdown
# My Project — AI Context Document

> Paste this into any AI coding assistant for instant project context.

## What is this project?
...

## Active Tasks (2)
### Add dark mode toggle
- Complexity: S | Priority: medium
...

## Quick AI Prompt Starter
You are helping me work on "My Project"...
```

Paste once → any AI immediately understands your project, stack, and priorities.

---

## Configuration

### config.json

```json
{
  "projects": [
    {
      "name": "My SaaS",
      "path": "~/Desktop/my-saas",
      "context": "A B2B SaaS with Next.js, Prisma, PostgreSQL. Multi-tenant. Ideas and tasks should fit this stack."
    },
    {
      "name": "Side Project",
      "path": "~/projects/side-project",
      "context": "A React Native mobile app. Ideas should be mobile-first."
    }
  ]
}
```

Paths support `~`. See `config.example.json` for more.

### Adding a project later

```bash
zili add
```

---

## Notion setup (optional)

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Copy the token (`ntn_...`)
3. Create a Notion **Database** page
4. Open it → `•••` → **Connections** → connect your integration
5. Copy the database ID from the URL
6. Add to `.env`:

```bash
cp .env.example .env
# fill in NOTION_TOKEN and NOTION_DATABASE_ID
```

Zili automatically adds `Status`, `Type`, `Project`, `Complexity`, and `Priority` columns.

---

## Marking a task done

```bash
mv my-project/active_tasks/2026-03-23-my-task  my-project/done_tasks/
zili context   # updates CONTEXT.md and TASKS.md
```

---

## How it works

```
you type: zili idea "..."
                ↓
    claude -p (your local Claude Code session)
                ↓
    structured JSON evaluation
                ↓
    saves BRD + design locally
    updates CONTEXT.md + TASKS.md
    syncs to Notion (if configured)
                ↓
    done ✅
```

No external API calls from Zili itself — it uses the `claude` CLI already installed with Claude Code. Your subscription, no extra keys.

---

## Project structure

```
zili/
  bin/
    zili.js                  ← CLI entry point
  src/
    chat.js                  ← interactive chatbot
    watcher.js               ← file watcher daemon
    cli.js                   ← terminal command handlers
    processor.js             ← calls claude CLI for ideas + tasks
    notion.js                ← Notion API integration
    context-generator.js     ← generates CONTEXT.md + TASKS.md
    config.js                ← loads and resolves config.json
    setup.js                 ← interactive setup wizard
    add-watch.js             ← add a project interactively
  config.example.json
  .env.example
  README.md
```

---

## Contributing

PRs welcome. Open an issue first for major changes.

---

## License

MIT — made by [Devayan Dewri](https://github.com/ItsDevayan)
