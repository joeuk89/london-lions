import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { gather } from '../src/programme/gather.js';
import { renderProgramme } from '../src/programme/render.js';
import { loadConfig } from '../src/sync/config.js';

const fixture = (name) => readFile(new URL(`./fixtures/gather/${name}`, import.meta.url), 'utf8');
const newsFixture = (name) => readFile(new URL(`./fixtures/news/${name}`, import.meta.url), 'utf8');

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
  return async (url, init) => {
    for (const [pattern, body] of pages) {
      if (url.includes(pattern)) {
        if (body instanceof Error) throw body;
        return typeof body === 'function' ? body(url, init) : body;
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

async function run(extraPages = [], extraProgramme = {}) {
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
    fixture: state.fixtures[2], state, config: await loadConfig(), programme: { ...programme, ...extraProgramme },
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

const NEWHAM = { newham_recorder: { kind: 'rss', url: 'https://www.newhamrecorder.co.uk/sport/rss/' } };

test('Newham Recorder reports covering both Lions teams are kept; women\'s team titles are not', async () => {
  const { bundle, data } = await run([
    ['newhamrecorder.co.uk/sport/rss', await newsFixture('newham-recorder.xml')],
    ['newhamrecorder.co.uk/sport/', `<article><p>${'The men edged Cheshire Phoenix 87-83 while London Lions Women won at last. '.repeat(10)}</p></article>`],
  ], NEWHAM);
  const newham = bundle.articles.filter((a) => a.id.startsWith('nr-'));
  assert.deepEqual(newham.map((a) => [a.id, a.scope, a.title]), [
    ['nr-1', 'lions', 'London Lions enjoy winning weekend as men remain unbeaten and women get off the mark'],
  ]);
  assert.equal(data.sources['nr-1'].publisher, 'Newham Recorder');
});

// The saved feed's items are a week too old for this fixture's window, so they are moved forward.
const googleFeed = async () => (await newsFixture('google-news.xml'))
  .replaceAll('12 Oct 2026', '20 Oct 2026').replaceAll('13 Oct 2026', '21 Oct 2026');
const GOOGLE = {
  google_news: {
    kind: 'google-news',
    queries: ['site:superleaguebasketballm.co.uk', '"London Lions" basketball', '"{opponent}" basketball'],
    exclude_publishers: ['DAZN', '365Scores'],
    decode_links: true,
    no_fetch_hosts: ['superleaguebasketballm.co.uk'],
  },
};
const SIGNED_PAGE = '<div data-n-a-ts="1792719579" data-n-a-sg="AbIa"></div>';
const batchResponse = (url) => `)]}'\n\n[["wrb.fr","Fbv4je",${JSON.stringify(JSON.stringify(['garturlres', url, 1]))},null,null,null,"generic"]]`;

test('Google News items stay headlines when their links do not decode', async () => {
  const searched = [];
  const { bundle, data } = await run([
    ['news.google.com/rss/search', async (url) => { searched.push(decodeURIComponent(url)); return googleFeed(); }],
    ['news.google.com/rss/articles', new Error('news.google.com responded 302')],
  ], GOOGLE);
  assert.deepEqual(bundle.headlines.map((h) => [h.id, h.scope, h.publisher]), [
    ['gn-1', 'lions', 'Sky Sports'], ['gn-2', 'lions', 'The New York Times'], ['gn-3', 'lions', 'London Now'], ['gn-4', 'lions', 'Sports Illustrated'],
  ], 'denylisted publishers are dropped, and repeats across the three queries');
  assert.match(bundle.headlines[0].url, /^https:\/\/news\.google\.com\/rss\/articles\//);
  assert.deepEqual(data.sources['gn-3'], { publisher: 'London Now', title: 'London Lions make history in first-ever match against an NBA team', url: bundle.headlines[2].url, published: '2026-10-21T07:00:00.000Z' });
  assert.ok(!bundle.articles.some((a) => a.id.startsWith('gn-')));
  assert.equal(bundle.notes.filter((n) => n.startsWith('Could not decode')).length, 4);
  assert.deepEqual(searched.map((u) => u.match(/q=(.*?)&/)[1]), [
    'site:superleaguebasketballm.co.uk when:7d', '"London Lions" basketball when:7d', '"Bristol Flyers" basketball when:7d',
  ]);
});

test('a decoded Google News link whose page reads becomes an article', async () => {
  const decoded = ['https://www.superleaguebasketballm.co.uk/news/1', 'https://pub.example/broken', 'https://pub.example/3', 'https://pub.example/4'];
  const { bundle } = await run([
    ['news.google.com/rss/search', googleFeed],
    ['news.google.com/rss/articles', SIGNED_PAGE],
    ['batchexecute', () => batchResponse(decoded.shift())],
    ['pub.example/broken', new Error('pub.example responded 403')],
    ['pub.example/', ARTICLE],
    ['superleaguebasketballm.co.uk', new Error('the no-fetch host must not be read')],
  ], GOOGLE);
  assert.deepEqual(bundle.headlines.map((h) => [h.id, h.url]), [
    ['gn-1', 'https://www.superleaguebasketballm.co.uk/news/1'], ['gn-2', 'https://pub.example/broken'],
  ]);
  assert.deepEqual(bundle.articles.filter((a) => a.id.startsWith('gn-')).map((a) => [a.id, a.publisher, a.url]), [
    ['gn-3', 'London Now', 'https://pub.example/3'], ['gn-4', 'Sports Illustrated', 'https://pub.example/4'],
  ]);
});

test('a Google News story already in a direct feed keeps the direct copy', async () => {
  const { bundle } = await run([
    ['hoopsfix.example', rss([['Blazers thump London Lions 119-66 in preseason action', 'Wed, 21 Oct 2026 18:00:00 +0000', 'London Lions lost in Portland. '.repeat(20)]])],
    ['news.google.com/rss/search', googleFeed],
    ['news.google.com/rss/articles', new Error('news.google.com responded 302')],
  ], GOOGLE);
  assert.ok(bundle.articles.some((a) => a.id === 'hf-1'));
  assert.ok(!bundle.headlines.some((h) => h.publisher === 'Sports Illustrated'));
});

test('a Google News query that returns a captcha page is a failed source', async () => {
  const { bundle } = await run([['news.google.com/rss/search', '<html>unusual traffic</html>']], GOOGLE);
  assert.deepEqual(bundle.failed.map((f) => f.label), [
    'Google News: site:superleaguebasketballm.co.uk', 'Google News: "London Lions" basketball', 'Google News: "Bristol Flyers" basketball',
  ]);
  assert.deepEqual(bundle.headlines, []);
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

test('the season opener gathers last season, the summer and a season-long news window', async () => {
  const config = await loadConfig();
  config.competitions = config.competitions.filter((c) => c.source?.kind !== 'euroleague' && c.previous?.kind !== 'euroleague');
  const empty = '<html><body></body></html>';
  const listing = `${CLUB_LISTING}
<a href="/news/lions-women-sign-a-centre-for-slbw"><h3>Lions sign a centre for the new season</h3><div>August 1, 2026</div></a>`;
  const pages = [
    ['/competition/41897/team/178242/roster', (await fixture('genius-roster.html')).replaceAll('Joel Scott', 'Ovie Soko').replaceAll('2503980', '999')],
    ['/competition/41897/team/178242/schedule', new Error('should not be read')],
    ['/competition/42212/team/178242/schedule', await fixture('genius-team-schedule.html')],
    ['/competition/42212/schedule?phaseName=Final', await fixture('genius-final.html')],
    ['/schedule', empty],
    ['/competition/41897/team/178242', empty],
    ['/competition/41897/team/178237', empty],
    ['/standings', await fixture('genius-standings.html')],
    ['/team/178242/roster', await fixture('genius-roster.html')],
    ['/team/178237/roster', await fixture('genius-roster.html')],
    ['/team/178237', await fixture('genius-summary.html')],
    ['/statistics', new Error('statistics are not read before anyone has played')],
    ['club.example/news/lions-women', `<div class="news-richtext"><p>${'She joins the SLBW squad. '.repeat(20)}</p></div>`],
    ['club.example/news/', ARTICLE],
    ['club.example/news', listing],
    ['hoopsfix.example', rss([])],
    ['bristolflyers.co.uk', rss([])],
    ['youtube.com', '<feed></feed>'],
  ];
  const { data, bundle } = await gather({
    fixture: state.fixtures[0], state, config, programme,
    now: new Date('2026-09-18T07:05:00Z'), fetch: fakeFetch(pages), pause: 0,
  });

  assert.equal(data.season_opener, true);
  assert.deepEqual(data.lions.record, { won: 0, lost: 0 });
  assert.deepEqual(data.lions.leaders.points, []);
  assert.equal(data.lions.roster[0].season, undefined);
  assert.equal(data.table, null);
  const [championship, trophy] = data.last_season.competitions;
  assert.deepEqual([championship.competition_name, championship.standing], ['SLB Championship', { position: 1, won: 6, lost: 0 }]);
  assert.deepEqual(trophy.last_game, {
    round: 'Final', final: true, date: '2026-02-01T15:30:00.000Z', opponent_name: 'Newcastle Eagles',
    home: true, venue_name: 'Utilita Arena Birmingham', for: 74, against: 68,
  });
  assert.deepEqual(data.summer, { joined: ['Joel Scott'], left: ['Ovie Soko'] });
  assert.equal(bundle.windows.lions_news_since, '2026-02-02T00:00:00.000Z');
  assert.deepEqual(bundle.articles.map((a) => a.title), ['Lions sign a new guard in September'], 'later and women\'s team items are left out');
  assert.ok(data.opponent.last_season, 'an opponent with no results this season gets a recap');
  assert.deepEqual(data.head_to_head.meetings.map((m) => m.competition_name), []);
});
