import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as news from '../src/programme/news.js';

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title>Flyers edge Liverpool</title><link>https://example.com/flyers-edge</link><pubDate>Sun, 18 Oct 2026 21:00:00 +0000</pubDate>
<category>Men</category><content:encoded><![CDATA[<p>Bristol Flyers won 90-89.</p><script>x()</script><p>Bailey scored 24.</p>]]></content:encoded></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<entry><title>LIONS EDGE CHESHIRE 87-83 | 18.10.26| London Lions Basketball UK</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/>
<published>2026-10-18T18:54:37+00:00</published><media:group><media:description>Highlights</media:description></media:group></entry>
</feed>`;

test('RSS items carry title, link, date, categories and full text without scripts', () => {
  const [item] = news.parseFeed(RSS);
  assert.equal(item.title, 'Flyers edge Liverpool');
  assert.equal(item.url, 'https://example.com/flyers-edge');
  assert.equal(item.published, '2026-10-18T21:00:00.000Z');
  assert.deepEqual(item.categories, ['Men']);
  assert.equal(news.htmlToText(item.html), 'Bristol Flyers won 90-89.\n\nBailey scored 24.');
});

test('Atom entries read the same way', () => {
  const [video] = news.parseFeed(ATOM);
  assert.equal(video.url, 'https://www.youtube.com/watch?v=abc');
  assert.equal(video.published, '2026-10-18T18:54:37.000Z');
  assert.equal(news.tidyVideoTitle(video.title), 'LIONS EDGE CHESHIRE 87-83');
});

test('listing dates are found inside the link, beside it, or in a nearby block', () => {
  const html = `<main>
    <a href="/news/lions-beat-cluj-on-the-road"><h3>Lions beat Cluj on the road in Romania</h3><div>October 21, 2026</div></a>
    <div><h4><a href="/news/jackson-forces-overtime-for-surrey">Jackson forces overtime as Surrey edge Leicester</a></h4><time>October 17, 2026</time></div>
    <div><a href="/turk-telekom-73-karsiyaka-72/">26.09.2026 Türk Telekom 73 – Karşıyaka 72</a></div>
    <div><a href="/news/roundup-of-the-week-in-the-slb">Round-up of the week in the SLB championship</a><span>1 Oct 2026</span><span>2 Oct 2026</span></div>
    <a href="/news/">All news</a><a href="https://elsewhere.com/news/x-long-title-off-site">An article on another website entirely</a>
  </main>`;
  const items = news.parseListing(html, { url: 'https://club.example/news', links: '/' });
  assert.deepEqual(items.map((i) => [i.url.replace('https://club.example', ''), i.published?.slice(0, 10) ?? null]), [
    ['/news/lions-beat-cluj-on-the-road', '2026-10-21'],
    ['/news/jackson-forces-overtime-for-surrey', '2026-10-17'],
    ['/turk-telekom-73-karsiyaka-72/', '2026-09-26'],
    ['/news/roundup-of-the-week-in-the-slb', null],
  ]);
  assert.equal(items[2].title, 'Türk Telekom 73 – Karşıyaka 72');
});

test('date formats: "Month D, YYYY", "Dth Month YYYY", "DD.MM.YYYY"', () => {
  assert.equal(news.findDate('Posted Oct 3, 2026'), '2026-10-03');
  assert.equal(news.findDate('21st October 2026'), '2026-10-21');
  assert.equal(news.findDate('01.11.2026 Haber'), '2026-11-01');
  assert.equal(news.findDate('no date here'), null);
});

test('article text prefers the article body over the page chrome', () => {
  const body = 'London Lions returned to winning ways in the EuroCup. '.repeat(10);
  const html = `<html><body><nav>Home Shop Tickets</nav><div class="news-richtext"><p>${body}</p></div><footer>Copyright</footer></body></html>`;
  assert.equal(news.articleText(html), body.trim());
});

test('news window: since the previous fixture, at least 7 days and at most 21 days back', () => {
  const now = new Date('2026-10-24T07:00:00Z');
  assert.equal(news.newsWindow(now, '2026-10-21T16:00:00Z'), '2026-10-17T07:00:00.000Z');
  assert.equal(news.newsWindow(now, '2026-10-12T16:00:00Z'), '2026-10-12T16:00:00.000Z');
  assert.equal(news.newsWindow(now, '2026-09-01T16:00:00Z'), '2026-10-03T07:00:00.000Z');
  assert.equal(news.newsWindow(now, undefined), '2026-10-03T07:00:00.000Z');
});

test('highlights are recaps, not live streams or fan content', () => {
  assert.equal(news.isHighlight('LONDON LIONS EDGE CHESHIRE 87-83 TO EXTEND UNBEATEN SLB START'), true);
  assert.equal(news.isHighlight('LIONS HANDLE BUSINESS IN CLUJ | 21.10.26| London Lions Basketball UK'), true);
  assert.equal(news.isHighlight('U-BT Cluj-Napoca vs London Lions LIVE | BKT EuroCup Round 4'), false);
  assert.equal(news.isHighlight('3 EMOJIS, GUESS THE COUNTRY CHALLENGE!'), false);
});

test('mentions match whole names, not parts of words', () => {
  assert.equal(news.mentions({ title: 'Sharks streak ends and Lions roll on' }, ['Lions']), true);
  assert.equal(news.mentions({ title: 'Lionsgate film night' }, ['Lions']), false);
  assert.equal(news.mentions({ title: 'Round-up', html: '<p>B. Braun Sheffield Sharks won</p>' }, ['B. Braun Sheffield Sharks']), true);
});
