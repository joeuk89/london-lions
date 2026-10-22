import assert from 'node:assert/strict';
import { test } from 'node:test';
import { programmePath, renderSeasonIndex } from '../src/app/season.js';

const competitions = [
  { id: 'slb-championship-2026-27', name: 'SLB Championship', badge: 'League' },
  { id: 'eurocup-2026-27', name: 'EuroCup' },
];

const fixture = (overrides) => ({
  competition: 'slb-championship-2026-27',
  opponent: 'bristol-flyers',
  opponent_name: 'Bristol Flyers',
  designated_home: true,
  venue: { name: 'Copper Box Arena' },
  status: 'scheduled',
  played: false,
  home: true,
  away: false,
  venue_change: false,
  ...overrides,
});

const fixtures = [
  fixture({ id: 'a', tipoff: '2026-10-03T18:00:00.000Z', played: true, result: { lions: 80, opponent: 78 } }),
  fixture({ id: 'b', tipoff: '2026-10-10T18:00:00.000Z', opponent: 'cheshire-phoenix', opponent_name: 'Cheshire Phoenix', designated_home: false, home: false, away: true, played: true, result: { lions: 70, opponent: 75 } }),
  fixture({ id: 'c', tipoff: '2026-10-24T17:00:00.000Z', competition: 'eurocup-2026-27', opponent: 'cluj', opponent_name: 'U-BT Cluj', venue_change: true, venue: { name: 'New City College Hackney' } }),
  fixture({ id: 'd', tipoff: '2026-10-31T18:00:00.000Z', status: 'withdrawn' }),
  fixture({ id: 'e', tipoff: '2026-11-07T15:00:00.000Z', home: true, away: true }),
];

const now = new Date('2026-10-24T07:00:00.000Z');
const order = (html) => [...html.matchAll(/class="fixture"[^>]*><span class="when"><time datetime="([^"]+)"/g)].map((m) => m[1].slice(0, 10));

test('programme paths carry the UK date of tip-off', () => {
  assert.equal(programmePath(fixture({ tipoff: '2026-10-24T23:30:00.000Z' })), 'programmes/2026-10-25-bristol-flyers/');
});

test('next fixture leads, then results newest first, then later fixtures', () => {
  const html = renderSeasonIndex({ fixtures, competitions, now });
  const next = html.slice(html.indexOf('<section class="next"'), html.indexOf('</section>'));
  assert.match(next, /v U-BT Cluj/);
  assert.match(next, /Programme arrives on game morning/);
  assert.match(next, /Venue change: New City College Hackney/);
  assert.match(next, /<span class="badge">EuroCup<\/span>/);
  assert.deepEqual(order(html), ['2026-10-10', '2026-10-03', '2026-10-31', '2026-11-07']);
  assert.match(html, /<b class="l">L 70–75<\/b>/);
  assert.match(html, /<span class="chip cancelled">Cancelled<\/span>/);
  assert.match(html, /title="Neutral venue">N</);
  assert.match(html, /title="Away">A<\/abbr> at Cheshire Phoenix/);
});

test('fixtures with a programme on disk link to it and the newest is marked for caching', () => {
  const programmes = new Set(['programmes/2026-10-03-bristol-flyers/', 'programmes/2026-10-24-cluj/']);
  const html = renderSeasonIndex({ fixtures, competitions, programmes, now });
  assert.match(html, /data-latest="programmes\/2026-10-24-cluj\/"/);
  assert.match(html, /<a class="read" href="programmes\/2026-10-24-cluj\/" data-programme>/);
  assert.match(html, /<a class="fixture" href="programmes\/2026-10-03-bristol-flyers\/" data-programme>/);
  assert.doesNotMatch(html, /href="programmes\/2026-10-10/);
});

test('a played fixture without a synced score says so', () => {
  const html = renderSeasonIndex({ fixtures: [fixture({ tipoff: '2026-10-20T18:00:00.000Z', played: true })], competitions, now });
  assert.match(html, /Score to come/);
  assert.doesNotMatch(html, /class="next"/);
});
