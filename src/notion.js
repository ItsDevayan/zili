/**
 * notion.js
 * Posts ideas and tasks to a Notion database.
 * Handles Notion's 100-block limit and 2000-char text limit automatically.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

// ─── Schema setup ─────────────────────────────────────────────────────────────

async function ensureDatabaseProperties() {
  await notion.databases.update({
    database_id: DATABASE_ID,
    properties: {
      Type: {
        select: {
          options: [
            { name: 'Idea', color: 'purple' },
            { name: 'Task', color: 'blue' },
          ],
        },
      },
      Status: {
        select: {
          options: [
            { name: 'Polished', color: 'green' },
            { name: 'Dumped', color: 'red' },
            { name: 'Active', color: 'yellow' },
            { name: 'Done', color: 'gray' },
          ],
        },
      },
      Project: { select: {} },
      Complexity: {
        select: {
          options: [
            { name: 'XS', color: 'gray' },
            { name: 'S', color: 'green' },
            { name: 'M', color: 'yellow' },
            { name: 'L', color: 'orange' },
            { name: 'XL', color: 'red' },
          ],
        },
      },
      Priority: {
        select: {
          options: [
            { name: 'critical', color: 'red' },
            { name: 'high', color: 'orange' },
            { name: 'medium', color: 'yellow' },
            { name: 'low', color: 'gray' },
          ],
        },
      },
    },
  });
}

// ─── Block helpers ────────────────────────────────────────────────────────────

function safeText(str, max = 1900) {
  return String(str || '').slice(0, max);
}

function para(text) {
  const chunks = [];
  const str = String(text || '');
  for (let i = 0; i < str.length || chunks.length === 0; i += 1900) {
    chunks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: str.slice(i, i + 1900) } }],
      },
    });
    if (str.length === 0) break;
  }
  return chunks;
}

function h2(text) {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: safeText(text) } }] },
  };
}

function h3(text) {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content: safeText(text) } }] },
  };
}

function bullet(text) {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ type: 'text', text: { content: safeText(text) } }],
    },
  };
}

function numbered(text) {
  return {
    object: 'block',
    type: 'numbered_list_item',
    numbered_list_item: {
      rich_text: [{ type: 'text', text: { content: safeText(text) } }],
    },
  };
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}

function callout(text, emoji = 'ℹ️') {
  return {
    object: 'block',
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji },
      rich_text: [{ type: 'text', text: { content: safeText(text) } }],
    },
  };
}

function markdownToBlocks(md) {
  const blocks = [];
  for (const raw of String(md || '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith('### ')) blocks.push(h3(line.slice(4).trim()));
    else if (line.startsWith('## ')) blocks.push(h2(line.slice(3).trim()));
    else if (line.startsWith('# ')) blocks.push(h2(line.slice(2).trim()));
    else if (/^[-*] /.test(line)) blocks.push(bullet(line.slice(2).trim()));
    else if (/^\d+\. /.test(line)) blocks.push(numbered(line.replace(/^\d+\. /, '').trim()));
    else blocks.push(...para(line.trim()));
  }
  return blocks;
}

async function appendInChunks(pageId, blocks) {
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + 100),
    });
    if (i + 100 < blocks.length) await new Promise((r) => setTimeout(r, 250));
  }
}

async function createPage(properties, allBlocks) {
  const page = await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties,
    children: allBlocks.slice(0, 100),
  });

  if (allBlocks.length > 100) {
    await appendInChunks(page.id, allBlocks.slice(100));
  }

  return page.url;
}

// ─── Idea page ────────────────────────────────────────────────────────────────

async function createIdeaPage(result, projectName, rawIdea) {
  const isPolished = result.verdict === 'polish';

  const blocks = [
    h2('📝 Original Idea'),
    ...para(rawIdea),
    divider(),
    callout(result.reason, isPolished ? '✅' : '❌'),
    divider(),
  ];

  if (isPolished) {
    blocks.push(
      h2('💡 Polished Idea'),
      ...para(result.polished_idea),
      divider(),
      h2('📋 Business Requirements Document'),
      ...markdownToBlocks(result.brd),
      divider(),
      h2('🏗️ Design & System Design'),
      ...markdownToBlocks(result.design),
    );
  }

  return createPage(
    {
      Name: { title: [{ type: 'text', text: { content: result.title } }] },
      Type: { select: { name: 'Idea' } },
      Status: { select: { name: isPolished ? 'Polished' : 'Dumped' } },
      Project: { select: { name: projectName } },
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
    },
    blocks,
  );
}

// ─── Task page ────────────────────────────────────────────────────────────────

async function createTaskPage(result, projectName, rawTask) {
  const blocks = [
    callout(
      `${result.complexity} complexity · ${result.priority} priority`,
      result.priority === 'critical' ? '🔥' : result.priority === 'high' ? '⚡' : '📌',
    ),
    divider(),
    h2('📝 Original Request'),
    ...para(rawTask),
    divider(),
    h2('📄 Description'),
    ...para(result.description),
    divider(),
    h2('✅ Acceptance Criteria'),
    ...(result.acceptance_criteria || []).map((c) => bullet(c)),
    divider(),
    h2('🛠️ Approach'),
    ...markdownToBlocks(result.approach),
    divider(),
    h2('🤖 AI Context (for coding assistants)'),
    ...para(result.ai_context),
  ];

  if (result.relevant_areas?.length) {
    blocks.push(divider(), h2('📁 Relevant Areas'));
    result.relevant_areas.forEach((a) => blocks.push(bullet(a)));
  }

  return createPage(
    {
      Name: { title: [{ type: 'text', text: { content: result.title } }] },
      Type: { select: { name: 'Task' } },
      Status: { select: { name: 'Active' } },
      Project: { select: { name: projectName } },
      Complexity: { select: { name: result.complexity } },
      Priority: { select: { name: result.priority } },
      Date: { date: { start: new Date().toISOString().split('T')[0] } },
    },
    blocks,
  );
}

module.exports = { ensureDatabaseProperties, createIdeaPage, createTaskPage };
