import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseCards } from '../src/sync/sources/club.js';
import { parseGames } from '../src/sync/sources/euroleague.js';
import { parseSchedule } from '../src/sync/sources/genius.js';

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('Genius Sports schedule rows: id, UK tip-off, sides, venue, status, score', async () => {
  const rows = parseSchedule(await fixture('genius.html'), { competition_id: '49597', team_id: '178242' });
  assert.equal(rows.length, 2);

  const played = rows.find((r) => r.source_id === 'genius:2882425');
  assert.equal(played.designated_home, false);
  assert.equal(played.opponent.name, 'Bristol Flyers');
  assert.equal(played.opponent.genius_team_id, '178237');
  assert.equal(played.tipoff.toISOString(), '2026-09-18T18:30:00.000Z');
  assert.deepEqual(played.venue, { key: 'genius:35244', name: 'SGS College Arena' });
  assert.equal(played.status, 'played');
  assert.deepEqual(played.result, { lions: 80, opponent: 78 });
  assert.match(played.url, /match\/2882425\/boxscore$/);

  const upcoming = rows.find((r) => r.source_id === 'genius:2882472');
  assert.equal(upcoming.designated_home, true);
  assert.equal(upcoming.status, 'scheduled');
  assert.equal(upcoming.result, null);
  assert.equal(upcoming.tipoff.toISOString(), '2026-10-24T17:00:00.000Z');
});

test('EuroLeague games: only Lions games, utcDate, venue with address', async () => {
  const games = parseGames(await fixture('euroleague.json'), { club_code: 'LLI' });
  assert.equal(games.length, 2);
  const home = games.find((g) => g.source_id === 'euroleague:U2026_71');
  assert.equal(home.designated_home, true);
  assert.equal(home.opponent.euroleague_code, 'TTK');
  assert.equal(home.tipoff.toISOString(), '2026-10-28T19:30:00.000Z');
  assert.equal(home.venue.key, 'euroleague:AUW3');
  assert.equal(home.venue.name, 'Copper Box Arena');
  assert.match(home.venue.address, /London/);
  const away = games.find((g) => g.source_id === 'euroleague:U2026_54');
  assert.equal(away.designated_home, false);
  assert.equal(away.opponent.euroleague_code, 'CLU');
});

test('EuroLeague response without a data array is an error, not an empty season', () => {
  assert.throws(() => parseGames('{"error":"down"}', { club_code: 'LLI' }), /no data array/);
});

test('Club cards: men only, UK date and time, flags, venue on home cards, neutral finals', async () => {
  const cards = parseCards(await fixture('club.html'));
  assert.equal(cards.length, 2, 'women\'s cards are skipped');
  const [home, away] = cards;
  assert.equal(home.league, 'SLB Championship');
  assert.equal(home.date, '2026-10-24');
  assert.equal(home.time, '18:00');
  assert.equal(home.designated_home, true);
  assert.equal(home.opponent_name, 'Bristol Flyers');
  assert.equal(home.flag, 'HOME');
  assert.equal(home.venue_name, 'Copper Box Arena');
  assert.equal(home.cancelled, false);
  assert.equal(away.league, 'EuroCup');
  assert.equal(away.designated_home, false);
  assert.equal(away.opponent_name, 'Maxima Roma');
  assert.equal(away.flag, 'AWAY');
  assert.equal(away.venue_name, null);
  assert.equal(away.neutral, false);
});
