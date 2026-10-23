import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as googleNews from '../src/programme/google-news.js';

const feed = () => readFile(new URL('./fixtures/news/google-news.xml', import.meta.url), 'utf8');

const PAGE = '<c-wiz><div jscontroller="aLI87" data-n-a-id="CBMiabc" data-n-a-ts="1792719579" data-n-a-sg="AbIaSL9BBWZ6ITrT0kyxfbQApoT8"></div></c-wiz>';
const BATCH = `)]}'

[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.skysports.com/nba/news/13598348/nba-london-lions-make-history\\",1]",null,null,null,"generic"],["di",7],["af.httprm",7,"6455248407569813500",22]]`;

test('search items carry the real publisher, with the publisher suffix cut from the title', async () => {
  const items = googleNews.parseSearch(await feed());
  assert.equal(items.length, 6);
  assert.deepEqual(items.map((i) => i.publisher), ['Sky Sports', 'The New York Times', 'DAZN', '365Scores', 'London Now', 'Sports Illustrated']);
  assert.equal(items[4].title, 'London Lions make history in first-ever match against an NBA team');
  assert.equal(items[4].published, '2026-10-13T07:00:00.000Z');
  assert.match(items[4].url, /^https:\/\/news\.google\.com\/rss\/articles\/CBMi/);
});

test('a captcha or consent page in place of the feed is an error', () => {
  assert.throws(() => googleNews.parseSearch('<html><body>Our systems have detected unusual traffic</body></html>'), /not a feed/);
});

test('the search URL carries the window and the UK edition', () => {
  assert.equal(
    googleNews.searchUrl('"London Lions" basketball', 7),
    'https://news.google.com/rss/search?q=%22London%20Lions%22%20basketball%20when%3A7d&hl=en-GB&gl=GB&ceid=GB:en',
  );
});

test('a link decodes through the article page signature and batchexecute', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    return url.includes('batchexecute') ? BATCH : PAGE;
  };
  const url = await googleNews.decodeLink('https://news.google.com/rss/articles/CBMiabc?oc=5', fetch);
  assert.equal(url, 'https://www.skysports.com/nba/news/13598348/nba-london-lions-make-history');
  assert.equal(calls[0].url, 'https://news.google.com/rss/articles/CBMiabc?hl=en-GB&gl=GB&ceid=GB:en');
  assert.match(calls[0].headers.cookie, /^SOCS=/);
  assert.equal(calls[1].method, 'POST');
  assert.ok(new URLSearchParams(calls[1].body).get('f.req').includes(String.raw`\"CBMiabc\",1792719579,\"AbIaSL9BBWZ6ITrT0kyxfbQApoT8\"`));
});

test('a page without a signature, or a response without a URL, fails the decode', async () => {
  await assert.rejects(googleNews.decodeLink('https://news.google.com/rss/articles/x', async () => '<html></html>'), /no decode signature/);
  assert.throws(() => googleNews.decodedUrl(`)]}'\n\n[["di",7]]`), /no URL/);
});
