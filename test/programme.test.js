import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseProse } from '../src/programme/prose.js';
import { renderProgramme, surname } from '../src/programme/render.js';

const fixtureFile = (name) => readFileSync(new URL(`fixtures/programme/${name}`, import.meta.url), 'utf8');
const bristol = () => JSON.parse(fixtureFile('bristol.json'));
const bristolMd = fixtureFile('bristol.md');

const FRONT = '---\nsummary: s\nwatch: w\n---\n';
const minimal = (body) => `${FRONT}${body}`;
const headings = (html) => [...html.matchAll(/<section><h2>([^<]*)/g)].map((m) => m[1].trim());

test('Bristol programme renders every section in the settled order', () => {
  const { html, warnings } = renderProgramme(bristol(), bristolMd);
  assert.deepEqual(headings(html), [
    'Form', 'Lions roster', 'Bristol Flyers', 'Things to watch', 'Head to head',
    'League table', 'Notable stats', 'Club news', "What's next",
  ]);
  assert.deepEqual(warnings, []);
  assert.doesNotMatch(html, /\[src:/);
  assert.match(html, /<title>London Lions v Bristol Flyers, Saturday 24 October 2026<\/title>/);
  assert.match(html, /<strong>18:00<\/strong>Copper Box Arena/);
  assert.doesNotMatch(html, /venue-flag/);
});

test('player cards carry labelled season averages from the roster', () => {
  const { html } = renderProgramme(bristol(), bristolMd);
  assert.match(html, /<h3>Joel Scott<\/h3><small class="season">Season: 10\.4 pts, 4\.8 reb, 22 min<\/small>/);
});

test('sources list groups every cited and data source by publisher', () => {
  const { html } = renderProgramme(bristol(), bristolMd);
  const aside = html.slice(html.indexOf('<aside'));
  for (const publisher of ['Genius Sports (SLB)', 'EuroLeague', 'YouTube', 'Bristol Flyers', 'London Lions']) {
    assert.match(aside, new RegExp(`<h3>${publisher.replace(/[()]/g, '\\$&')}</h3>`));
  }
  assert.match(aside, /Game recap: Bristol Flyers 90–89 Liverpool Basketball<\/a>, 18 Oct 2026/);
});

test('an away fixture puts the opponent first and a venue change gets the flag and a Maps link', () => {
  const data = bristol();
  data.fixture.designated_home = false;
  data.fixture.venue_change = true;
  data.fixture.venue = { name: 'New City College Hackney', address: 'Falkirk Street, London N1 6HQ', directions: 'Hoxton Overground, 5 minutes' };
  const { html } = renderProgramme(data, bristolMd);
  assert.match(html, /<h1>Bristol Flyers <i>v<\/i> <b>London Lions<\/b><\/h1>/);
  assert.match(html, /Venue change: this game is at New City College Hackney, <a href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=New%20City%20College%20Hackney%2C%20Falkirk%20Street/);
  assert.match(html, /<span>Hoxton Overground, 5 minutes<\/span>/);
});

test('a league table without points drops the Pts column', () => {
  const data = bristol();
  data.table.rows = data.table.rows.map(({ points, ...row }) => row);
  const { html } = renderProgramme(data, bristolMd);
  assert.doesNotMatch(html, /<th class="n">Pts<\/th>/);
  assert.doesNotMatch(html, /undefined/);
});

test('a paragraph without a source marker fails', () => {
  assert.throws(() => parseProse(minimal('## Club news\n\nUnsourced claim.\n')), /Club news: paragraph has no \[src:…\] marker/);
  assert.throws(() => parseProse(minimal('## Things to watch\n\n- Sourced [src:a]\n- Not sourced\n')), /Things to watch: paragraph has no/);
});

test('a malformed marker fails rather than printing', () => {
  assert.throws(() => parseProse(minimal('## Club news\n\nA claim. [src:club-1] [src:el-U2025-games]\n')), /Club news: malformed source marker/);
});

test('a marker with no matching source fails', () => {
  const md = bristolMd.replace('[src:club-news-saily]', '[src:nowhere]');
  assert.throws(() => renderProgramme(bristol(), md), /\[src:nowhere\] does not resolve/);
});

test('unknown, repeated and out-of-order sections fail', () => {
  const data = bristol();
  assert.throws(() => renderProgramme(data, minimal('## Weather\n\nSunny. [src:gs-schedule]\n')), /Unknown programme section "Weather"/);
  assert.throws(() => renderProgramme(data, minimal('## Club news\n\nA. [src:gs-schedule]\n\n## Form\n\nB. [src:gs-schedule]\n')), /"Form" is out of order/);
  assert.throws(() => renderProgramme(data, minimal('## Form\n\nA. [src:gs-schedule]\n\n## Form\n\nB. [src:gs-schedule]\n')), /"Form" appears twice/);
});

test('a mandatory section with no data fails', () => {
  const data = bristol();
  data.lions.roster = [];
  assert.throws(() => renderProgramme(data, bristolMd), /Mandatory section "Lions roster" has no data/);
});

test('What\'s next with nothing stored after this fixture says so rather than failing', () => {
  const data = bristol();
  data.next = [];
  const { html } = renderProgramme(data, bristolMd);
  assert.match(html, /What&#39;s next|What's next/);
  assert.match(html, /<p class="muted">No further fixtures scheduled yet\.<\/p>/);
  assert.doesNotMatch(html, /season is over/i);
});

test('omittable sections drop out, and are warned about unless the front-matter gives a reason', () => {
  const md = bristolMd.replace(/## Club news\n\n.*\n\n/, '');
  const { html, warnings } = renderProgramme(bristol(), md);
  assert.ok(!headings(html).includes('Club news'));
  assert.deepEqual(warnings, ['Section "Club news" is missing and not listed as omitted']);
});

test('a mandatory section cannot be listed as omitted', () => {
  const md = bristolMd.replace('section: Injury and availability', 'section: Head to head');
  assert.throws(() => renderProgramme(bristol(), md), /Mandatory section "Head to head" cannot be omitted/);
});

test('a league table without table data is left out', () => {
  const data = bristol();
  data.table = null;
  const md = bristolMd.replace('## League table\n\n', '');
  assert.ok(!headings(renderProgramme(data, md).html).includes('League table'));
});

test('a player card must name someone on that team’s roster', () => {
  const md = bristolMd.replace('### Matteus Case', '### Thomas Kennedy');
  assert.throws(() => renderProgramme(bristol(), md), /Player card Thomas Kennedy is not on the Bristol Flyers roster/);
});

test('HTML in the prose is escaped inline and rejected as a block', () => {
  const inline = bristolMd.replace('Saily, the travel', 'Saily <script>alert(1)</script>, the travel');
  const { html } = renderProgramme(bristol(), inline);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const block = bristolMd.replace('Saily, the travel', '<div>x</div>\n\nSaily, the travel');
  assert.throws(() => renderProgramme(bristol(), block), /Club news: unsupported Markdown \(html\)/);
});

test('surname drops generational suffixes', () => {
  assert.equal(surname('Thomas Kennedy'), 'Kennedy');
  assert.equal(surname('Maxwell Lewis III'), 'Lewis');
  assert.equal(surname('Michael Diggins Jr'), 'Diggins');
});

function opener() {
  const data = bristol();
  data.season_opener = true;
  data.lions.record = { won: 0, lost: 0 };
  data.lions.results = [];
  data.lions.leaders = { points: [], rebounds: [], assists: [], steals: [], threes: [] };
  data.lions.roster = data.lions.roster.map(({ season, ...player }) => player);
  data.last_season = {
    competitions: [
      { competition_name: 'SLB Championship', league: true, standing: { position: 1, won: 26, lost: 6 }, last_game: { round: null, final: false, date: '2026-04-25', opponent_name: 'Surrey 89ers', home: false, venue_name: null, for: 86, against: 62 } },
      { competition_name: 'SLB Play-offs', league: false, standing: null, last_game: { round: 'Final', final: true, date: '2026-05-17T15:30:00.000Z', opponent_name: 'Cheshire Phoenix', home: true, venue_name: 'The O2', for: 104, against: 81 } },
    ],
    ended: '2026-05-17T15:30:00.000Z',
  };
  data.summer = { joined: ['Thomas Kennedy'], left: ['Ovie Soko'] };
  data.table = null;
  return data;
}
const OPENER_MD = minimal(`Welcome back. [src:gs-standings]

## Last season: three trophies

The Lions won the league. [src:gs-standings]

## The summer

Kennedy arrived. [src:club-news-saily]

## Lions roster

### Joel Scott

Back for a second season. [src:club-news-saily]

## The opposition

Bristol are here. [src:gs-standings]

## Head to head

They met last season. [src:gs-standings]

## What's next

More to come. [src:gs-standings]
`);

test('the season opener puts Last season and The summer in place of Form', () => {
  const { html } = renderProgramme(opener(), OPENER_MD);
  assert.deepEqual(headings(html), ['Last season', 'The summer', 'Lions roster', 'Bristol Flyers', 'Head to head', "What's next"]);
  assert.match(html, /<span>Final standing<\/span><span>1st, 26–6<\/span>/);
  assert.match(html, /Final v Cheshire Phoenix at The O2<\/span><span>W 104–81<\/span>/);
  assert.doesNotMatch(html, /Surrey 89ers/, 'the league\'s last game is left out of the Lions\' recap');
  assert.match(html, /<h3>In<\/h3><ul class="links"><li>Thomas Kennedy<\/li>/);
  assert.match(html, /<h3>Not in this season’s squad<\/h3><ul class="links"><li>Ovie Soko<\/li>/);
});

test('before anyone has played, cards have no stat line and the comparison table shows dashes', () => {
  const { html } = renderProgramme(opener(), OPENER_MD);
  assert.match(html, /<h3>Joel Scott<\/h3><p>/);
  assert.match(html, /<tr><td>0–0<\/td><th scope="row">Record<\/th>/);
  assert.match(html, /<tr><td>–<\/td><th scope="row">Top scorer<\/th>/);
  assert.match(html, /<tr><td>–<\/td><th scope="row">Last game<\/th>/);
});

test('Form is unknown at the opener, and Last season is unknown anywhere else', () => {
  assert.throws(() => renderProgramme(opener(), OPENER_MD.replace('## The summer', '## Form')), /Unknown programme section "Form"/);
  assert.throws(() => renderProgramme(bristol(), bristolMd.replace('## Form', '## Last season')), /Unknown programme section "Last season"/);
});

test('Last season is mandatory at the opener', () => {
  const data = opener();
  data.last_season.competitions = [];
  assert.throws(() => renderProgramme(data, OPENER_MD), /Mandatory section "Last season" has no data/);
});

test('an opponent with no results gets last season in place of its last five', () => {
  const data = bristol();
  data.opponent.results = [];
  data.opponent.last_season = {
    competitions: [{ competition_name: 'SLB Cup', league: false, standing: null, last_game: { round: 'Quarter Finals', final: false, date: '2026-01-25T15:00:00.000Z', opponent_name: 'Manchester Basketball', home: false, venue_name: 'National Basketball Performance Centre', for: 67, against: 92 } }],
    ended: '2026-01-25T15:00:00.000Z',
  };
  const { html } = renderProgramme(data, bristolMd);
  assert.doesNotMatch(html, /<h3>Last five<\/h3>/);
  assert.match(html, /<p class="muted">First season in this competition\.<\/p>/);
  assert.match(html, /Quarter Finals, at Manchester Basketball<\/span><span>L 67–92<\/span>/);
});
