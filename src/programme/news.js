import { load } from 'cheerio';

const DAY = 24 * 60 * 60 * 1000;
export const ARTICLE_CHARS = 6000;

const squash = (s) => s.replace(/\s+/g, ' ').trim();

export function htmlToText(html) {
  const $ = load(`<div id="root">${html ?? ''}</div>`);
  $('script, style, figure, iframe').remove();
  const blocks = $('#root').find('p, h2, h3, h4, li').map((_, el) => squash($(el).text())).get().filter(Boolean);
  return (blocks.length > 0 ? blocks.join('\n\n') : squash($('#root').text())).slice(0, ARTICLE_CHARS);
}

// RSS 2.0 (WordPress, TYPO3) and Atom (YouTube) in one reader.
export function parseFeed(xml) {
  const $ = load(xml, { xml: true });
  const items = $('item').map((_, el) => {
    const item = $(el);
    return {
      title: squash(item.children('title').text()),
      url: squash(item.children('link').text()),
      published: dateOrNull(item.children('pubDate').text()),
      categories: item.children('category').map((__, c) => squash($(c).text())).get(),
      html: item.children('content\\:encoded').text() || item.children('description').text(),
    };
  }).get();
  if (items.length > 0) return items;
  return $('entry').map((_, el) => {
    const entry = $(el);
    return {
      title: squash(entry.children('title').text()),
      url: entry.children('link').attr('href') ?? '',
      published: dateOrNull(entry.children('published').text()),
      categories: [],
      html: entry.find('media\\:description').text(),
    };
  }).get();
}

function dateOrNull(s) {
  const d = new Date(s);
  return s && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31
  ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);

const MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const DATE_FORMATS = [
  [new RegExp(`\\b${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})\\b`, 'gi'), (m) => iso(m[3], month(m[1]), Number(m[2]))],
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? ${MONTH}\\.?,? (\\d{4})\\b`, 'gi'), (m) => iso(m[3], month(m[2]), Number(m[1]))],
  [/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (m) => iso(m[3], Number(m[2]), Number(m[1]))],
];

// "October 21, 2026", "21st October 2026", "26.09.2026": the formats the listing pages print.
export function allDates(text) {
  return DATE_FORMATS
    .flatMap(([pattern, toIso]) => [...text.matchAll(pattern)].map((m) => ({ at: m.index, date: toIso(m) })))
    .filter((d) => d.date)
    .sort((a, b) => a.at - b.at)
    .map((d) => d.date);
}

export const findDate = (text) => allDates(text)[0] ?? null;

function spacedText(node) {
  if (node.type === 'text') return node.data;
  return (node.children ?? []).map(spacedText).join(' ');
}

// A news listing is a set of links to articles, each near one printed date. The date is taken
// from the closest element around the link that holds exactly one date.
export function parseListing(html, { url, links = '/' }) {
  const $ = load(html);
  const listing = new URL(url);
  const seen = new Map();
  $('a[href]').each((_, el) => {
    const a = $(el);
    let href;
    try {
      href = new URL(a.attr('href'), listing);
    } catch {
      return;
    }
    if (href.origin !== listing.origin || !href.pathname.startsWith(links)) return;
    if (href.pathname.replace(/\/$/, '') === listing.pathname.replace(/\/$/, '')) return;
    const title = squash(a.find('h1, h2, h3, h4').first().text() || a.text());
    if (title.length < 20) return;
    let published = null;
    let depth = 0;
    for (let node = a; node.length && depth < 6; node = node.parent(), depth += 1) {
      const dates = new Set(allDates(squash(spacedText(node[0]))));
      if (dates.size === 1) [published] = dates;
      if (dates.size > 0) break;
    }
    const key = href.href.replace(/[?#].*$/, '');
    const found = { title: titleWithoutDate(title), url: key, published: published ? `${published}T12:00:00.000Z` : null, depth };
    const previous = seen.get(key);
    if (!previous || (published && (!previous.published || depth < previous.depth))) seen.set(key, found);
  });
  return [...seen.values()].map(({ depth, ...item }) => item);
}

const titleWithoutDate = (title) => title.replace(/^\d{1,2}\.\d{1,2}\.\d{4}\s*/, '');

const CONTENT = ['[itemprop="articleBody"]', '.news-richtext', '.entry-content', '.w-richtext', 'article', 'main', 'body'];
const NOISE = 'script, style, nav, header, footer, aside, form, figure, iframe, [role="navigation"], [class*="menu"]';
const PROSE = 'p, h2, h3, blockquote';

// Pages are read for their prose only: menus and link lists live in li elements, articles in p.
export function articleText(html) {
  const $ = load(html);
  $(NOISE).remove();
  const prose = (el) => $(el).find(PROSE).map((_, b) => squash($(b).text())).get().filter(Boolean);
  for (const selector of CONTENT) {
    const best = $(selector).toArray().map(prose).sort((a, b) => b.join('').length - a.join('').length)[0];
    if (best && (best.join('').length > 300 || selector === 'body')) return best.join('\n\n').slice(0, ARTICLE_CHARS);
  }
  return '';
}

export function articleDate(html) {
  const $ = load(html);
  const meta = $('meta[property="article:published_time"]').attr('content') || $('time[datetime]').first().attr('datetime');
  return dateOrNull(meta);
}

// Since the side's previous fixture, but never less than 7 days back or more than 21.
export function newsWindow(now, previous) {
  const at = now.getTime();
  const from = previous ? new Date(previous).getTime() : at - 21 * DAY;
  return new Date(Math.min(at - 7 * DAY, Math.max(at - 21 * DAY, from))).toISOString();
}

export const highlightsWindow = (now) => new Date(now.getTime() - 7 * DAY).toISOString();

export const normalise = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
export function mentions(item, names) {
  const haystack = ` ${normalise(`${item.title} ${item.categories?.join(' ') ?? ''} ${item.html ?? item.text ?? ''}`)} `;
  return names.some((n) => haystack.includes(` ${normalise(n).trim()} `));
}

// Recaps carry a score or the "| 21.10.26|" date stamp in the title; live streams and fan content don't.
export function isHighlight(title) {
  if (/\blive\b/i.test(title)) return false;
  return /\d{2,3}\s*[-–]\s*\d{2,3}/.test(title) || /\|\s*\d{1,2}\.\d{1,2}\.\d{2}\s*\|/.test(title) || /highlights/i.test(title);
}

export const tidyVideoTitle = (title) => title.replace(/\s*\|\s*\d{1,2}\.\d{1,2}\.\d{2}\s*\|.*$/, '').trim();
