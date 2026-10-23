import { load } from 'cheerio';
import { parseFeed } from './news.js';

const LOCALE = 'hl=en-GB&gl=GB&ceid=GB:en';
const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute';
// From a UK address, article pages redirect to Google's consent page unless this cookie is sent.
const CONSENT = { cookie: 'SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg' };

const squash = (s) => s.replace(/\s+/g, ' ').trim();

export const searchUrl = (query, days) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${days}d`)}&${LOCALE}`;

// Titles end " - <publisher>"; the publisher also sits in <source>. The description only repeats the title.
export function parseSearch(xml) {
  if (!/<rss[\s>]/.test(xml)) throw new Error('Google News returned a page, not a feed');
  const $ = load(xml, { xml: true });
  const publishers = $('item').map((_, el) => squash($(el).children('source').text())).get();
  return parseFeed(xml).map((item, i) => {
    const publisher = publishers[i] || 'Google News';
    const suffix = ` - ${publisher}`;
    const title = item.title.endsWith(suffix) ? item.title.slice(0, -suffix.length) : item.title;
    return { title, url: item.url, published: item.published, publisher, categories: [], html: '' };
  });
}

export function decodeRequest(page, id) {
  const signature = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const timestamp = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!signature || !timestamp) throw new Error('the article page has no decode signature');
  const request = ['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(timestamp), signature];
  return new URLSearchParams({ 'f.req': JSON.stringify([[['Fbv4je', JSON.stringify(request), null, 'generic']]]) }).toString();
}

export function decodedUrl(response) {
  const rows = JSON.parse(response.replace(/^\)\]\}'\s*/, ''));
  const row = rows.find((r) => r[0] === 'wrb.fr' && r[1] === 'Fbv4je');
  const [kind, url] = row?.[2] ? JSON.parse(row[2]) : [];
  if (kind !== 'garturlres' || !url) throw new Error('batchexecute returned no URL');
  return url;
}

// Two requests per link: the article page for its signature, then batchexecute for the publisher URL.
export async function decodeLink(link, fetch) {
  const id = new URL(link).pathname.split('/').pop();
  const page = await fetch(`https://news.google.com/rss/articles/${id}?${LOCALE}`, { headers: CONSENT });
  const response = await fetch(BATCH_URL, {
    method: 'POST',
    headers: { ...CONSENT, 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: decodeRequest(page, id),
  });
  return decodedUrl(response);
}
