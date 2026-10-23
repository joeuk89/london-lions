import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gather } from '../src/programme/gather.js';
import { renderProgramme } from '../src/programme/render.js';
import { loadConfig } from '../src/sync/config.js';

const fixture = (name) => readFile(new URL(`./fixtures/gather/${name}`, import.meta.url), 'utf8');

const programme = {
  site_url: 'https://example.github.io/london-lions/',
  club_news: { kind: 'html', url: 'https://club.example/news', links: '/news/' },
  hoopsfix: { kind: 'rss', url: 'https://hoopsfix.example/feed/' },
  youtube_channel_id: 'UC123',
};

const CLUB_LISTING = `<a href="/news/lions-edge-cheshire-to-stay-unbeaten"><h3>Lions edge Cheshire to stay unbeaten</h3><div>October 18, 2026</div></a>
<a href="/news/lions-sign-a-new-guard-in-september"><h3>Lions sign a new guard in September</h3><div>September 2, 2026</div></a>`;
const ARTICLE = `<html><body><div class="news-richtext"><p>${'Joel Scott hit both free throws late on. '.repeat(10)}</p></div></body></html>`;
const rss = (items) => `<rss><channel>${items.map(([title, date, text]) => `<item><title>${title}</title><link>https://x.example/${encodeURIComponent(title)}</link><pubDate>${date}</pubDate><description><![CDATA[<p>${text}</p>]]></description></item>`).join('')}</channel></rss>`;

function fakeFetch(pages) {
  return async (url) => {
    for (const [pattern, body] of pages) {
      if (url.includes(pattern)) {
        if (body instanceof Error) throw body;
        return typeof body === 'function' ? body() : body;
      }
    }
    throw new Error(`${url} responded 404`);
  };
}

const stored = (id, opponent, opponentName, tipoff, extra = {}) => ({
  id, competition: 'slb-championship-2026-27', opponent, opponent_name: opponentName, designated_home: true, tipoff,
  venue: { key: 'genius:35248', name: 'Copper Box Arena', address: 'Queen Elizabeth Olympic Park, London E20 3HB', in_london: true, home_venue: true },
  status: 'scheduled', home: true, away: false, venue_change: false, ...extra,
});

const state = {
  fixtures: [
    stored('f1', 'bristol-flyers', 'Bristol Flyers', '2026-09-18T18:30:00.000Z', { designated_home: false, played: true, result: { lions: 80, opponent: 78 }, venue: { name: 'SGS College Arena' } }),
    stored('f2', 'cheshire-phoenix', 'Cheshire Phoenix', '2026-10-18T16:30:00.000Z', { played: true, result: { lions: 87, opponent: 83 } }),
    stored('f3', 'bristol-flyers', 'Bristol Flyers', '2026-10-24T17:00:00.000Z'),
    stored('f4', 'sheffield-sharks', 'Sheffield Sharks', '2026-10-30T19:00:00.000Z', { status: 'withdrawn' }),
    stored('f5', 'leicester-riders', 'Leicester Riders', '2026-11-06T19:00:00.000Z', { venue: { name: 'New City College Hackney' }, venue_change: true }),
  ],
};

async function run(extraPages = []) {
  const pages = [
    ...extraPages,
    ['/standings', await fixture('genius-standings.html')],
    ['/team/178242/roster', await fixture('genius-roster.html')],
    ['/team/178242/statistics', await fixture('genius-statistics.html')],
    ['/team/178237/roster', await fixture('genius-roster.html')],
    ['/team/178237/statistics', await fixture('genius-statistics.html')],
    ['/team/178237', await fixture('genius-summary.html')],
    ['club.example/news/', ARTICLE],
    ['club.example/news', CLUB_LISTING],
    ['hoopsfix.example', rss([
      ['Lions roll on in week four', 'Mon, 19 Oct 2026 18:00:00 +0000', 'London Lions beat Cheshire. '.repeat(20)],
      ['Surrey get first win', 'Mon, 19 Oct 2026 18:00:00 +0000', 'Surrey 89ers beat Leicester. '.repeat(20)],
    ])],
    ['bristolflyers.co.uk', rss([['Flyers edge Liverpool', 'Sun, 18 Oct 2026 21:00:00 +0000', 'Bristol Flyers won 90-89. '.repeat(20)]])],
    ['youtube.com', `<feed><entry><title>LIONS EDGE CHESHIRE 87-83 | 18.10.26| London Lions</title><link href="https://www.youtube.com/watch?v=abc"/><published>2026-10-18T19:00:00+00:00</published></entry></feed>`],
  ];
  return gather({
    fixture: state.fixtures[2], state, config: await loadConfig(), programme,
    now: new Date('2026-10-24T07:05:00Z'), fetch: fakeFetch(pages), pause: 0,
  });
}

test('the data file carries every block the template renders', async () => {
  const { data } = await run();
  assert.equal(data.fixture.competition_name, 'SLB Championship');
  assert.deepEqual(data.lions.record, { position: 1, won: 6, lost: 0 });
  assert.deepEqual(data.opponent.record, { position: 2, won: 4, lost: 2 });
  assert.deepEqual(data.lions.results.map((r) => [r.opponent_name, r.for, r.against, r.competition_name]), [
    ['Cheshire Phoenix', 87, 83, 'SLB'], ['Bristol Flyers', 80, 78, 'SLB'],
  ]);
  assert.equal(data.opponent.results[0].opponent_name, 'Liverpool Basketball');
  assert.deepEqual(data.head_to_head, {
    scope: 'this-season',
    meetings: [{ date: '2026-09-18T18:30:00.000Z', competition_name: 'SLB', home: false, venue_name: 'SGS College Arena', lions: 80, opponent: 78 }],
  });
  assert.equal(data.table.rows[0].team, 'London Lions');
  assert.deepEqual(data.next.map((f) => [f.opponent_name, f.venue_change]), [['Leicester Riders', true]], 'withdrawn fixtures are not next');
  assert.deepEqual(data.lions.highlights, [{ title: 'LIONS EDGE CHESHIRE 87-83', url: 'https://www.youtube.com/watch?v=abc', published: '2026-10-18T19:00:00.000Z' }]);
  for (const id of data.data_sources) assert.ok(data.sources[id], `data source ${id} is listed`);
});

test('the bundle keeps articles inside their window', async () => {
  const { bundle, data } = await run();
  assert.deepEqual(bundle.articles.map((a) => [a.id, a.scope, a.title]), [
    ['club-1', 'lions', 'Lions edge Cheshire to stay unbeaten'],
    ['hf-1', 'lions', 'Lions roll on in week four'],
    ['opp-1', 'opponent', 'Flyers edge Liverpool'],
  ]);
  assert.match(bundle.articles[0].text, /^Joel Scott hit both free throws/);
  assert.deepEqual(bundle.failed, []);
  assert.equal(data.sources['opp-1'].publisher, 'Bristol Flyers');
});

test('a failed news source is recorded and its articles left out', async () => {
  const { bundle } = await run([['hoopsfix.example', new Error('hoopsfix.example responded 503')]]);
  assert.deepEqual(bundle.failed.map((f) => f.label), ['Hoopsfix news']);
  assert.ok(!bundle.articles.some((a) => a.id.startsWith('hf-')));
});

test('a failed highlights feed leaves the programme without highlights', async () => {
  const { data, bundle } = await run([['youtube.com', new Error('youtube.com responded 404')]]);
  assert.deepEqual(data.lions.highlights, []);
  assert.ok(bundle.failed.some((f) => f.label === 'Highlights'));
});

test('a failed league page fails the gather, since mandatory sections need it', async () => {
  await assert.rejects(run([['/team/178237/roster', new Error('genius responded 500')]]), /responded 500/);
});

test('gathered data renders with a minimal programme', async () => {
  const { data } = await run();
  const md = '---\nsummary: s\nwatch: w\n---\n\nBristol come to the Copper Box. [src:gs-standings] [src:club-1]\n';
  const { html } = renderProgramme(data, md);
  assert.match(html, /Lions edge Cheshire to stay unbeaten/);
});
