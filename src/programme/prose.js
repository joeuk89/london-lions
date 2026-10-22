import { Marked } from 'marked';
import YAML from 'yaml';

const MARKER = /\s*\[src:([a-z0-9][a-z0-9-]*)\]/g;

export const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const markdown = new Marked({
  renderer: {
    html: ({ text }) => escapeHtml(text),
  },
});

export const normaliseHeading = (text) => text.replace(/[‘’]/g, "'").trim();

function splitFrontMatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) throw new Error('Programme Markdown has no front-matter block');
  const meta = YAML.parse(match[1]);
  if (!meta || typeof meta !== 'object') throw new Error('Programme front-matter is not a mapping');
  return { meta, body: source.slice(match[0].length) };
}

function marked(text, where) {
  const sources = [...text.matchAll(MARKER)].map((m) => m[1]);
  if (sources.length === 0) {
    throw new Error(`${where}: paragraph has no [src:…] marker: "${text.slice(0, 60)}…"`);
  }
  return { html: markdown.parseInline(text.replace(MARKER, '').trim()), sources };
}

// Splits Claude's Markdown into an intro and `##` sections. Every paragraph,
// list item and player card must carry a source marker.
export function parseProse(source) {
  const { meta, body } = splitFrontMatter(source);
  const intro = [];
  const sections = [];
  let blocks = intro;
  let card = null;
  let where = 'Intro';

  for (const token of markdown.lexer(body)) {
    if (token.type === 'space') continue;
    if (token.type === 'heading' && token.depth === 2) {
      const text = normaliseHeading(token.text);
      const cut = text.indexOf(': ');
      const heading = cut === -1 ? text : text.slice(0, cut);
      const subtitle = cut === -1 ? null : markdown.parseInline(text.slice(cut + 2));
      blocks = [];
      card = null;
      where = heading;
      sections.push({ heading, subtitle, blocks });
    } else if (token.type === 'heading' && token.depth === 3) {
      card = { type: 'card', name: token.text.trim(), paragraphs: [] };
      blocks.push(card);
    } else if (token.type === 'paragraph') {
      const paragraph = marked(token.text, card ? `${where}, ${card.name}` : where);
      if (card) card.paragraphs.push(paragraph);
      else blocks.push({ type: 'p', ...paragraph });
    } else if (token.type === 'list' && !token.ordered) {
      if (card) throw new Error(`${where}, ${card.name}: lists are not allowed inside a player card`);
      blocks.push({ type: 'list', items: token.items.map((item) => marked(item.text, where)) });
    } else {
      throw new Error(`${where}: unsupported Markdown (${token.type}${token.depth ? ` level ${token.depth}` : ''})`);
    }
  }

  for (const block of sections.flatMap((s) => s.blocks)) {
    if (block.type === 'card' && block.paragraphs.length === 0) {
      throw new Error(`Player card ${block.name} has no text`);
    }
  }
  return { meta, intro, sections };
}

export function citedSources({ intro, sections }) {
  const ids = [];
  const visit = (blocks) => {
    for (const block of blocks) {
      if (block.type === 'p') ids.push(...block.sources);
      if (block.type === 'list') for (const item of block.items) ids.push(...item.sources);
      if (block.type === 'card') for (const p of block.paragraphs) ids.push(...p.sources);
    }
  };
  visit(intro);
  for (const section of sections) visit(section.blocks);
  return ids;
}
