import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as league from '../src/programme/league.js';

const fixture = (name) => readFile(new URL(`./fixtures/gather/${name}`, import.meta.url), 'utf8');

test('Genius roster and per-game statistics join on the person id', async () => {
  const roster = league.parseGeniusRoster(await fixture('genius-roster.html'));
  const stats = league.parseGeniusStatistics(await fixture('genius-statistics.html'));
  assert.deepEqual(roster[0], { id: '2503980', number: 1, name: 'Joel Scott', position: 'C/F' });

  const joined = league.joinRoster(roster, stats);
  assert.deepEqual(joined[0], { number: 1, name: 'Joel Scott', position: 'C/F', season: { pts: 10.4, reb: 4.8, ast: 1.6, min: 23 } });
  assert.equal(joined.find((p) => p.name === 'Devante Jones').season, undefined, 'a player with no stats row gets no stat line');
});

test('leaders come from rostered players with at least half the games', async () => {
  const roster = league.parseGeniusRoster(await fixture('genius-roster.html'));
  const stats = league.parseGeniusStatistics(await fixture('genius-statistics.html'));
  const leaders = league.leaders(roster, stats);
  assert.deepEqual(leaders.points, [{ name: 'Joel Scott', value: 10.4 }]);
  assert.deepEqual(leaders.assists, [{ name: 'Morayo Soluade', value: 4.2 }]);
  assert.deepEqual(leaders.threes, [{ name: 'Maxwell Lewis III', made: 1, attempted: 3.6 }]);
});

test('leaders share a line when tied at one decimal', () => {
  const roster = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const stats = [
    { id: 'a', games: 6, pts: 10, stl: 1.54, tpm: 1, tpa: 3 },
    { id: 'b', games: 6, pts: 8, stl: 1.46, tpm: 0, tpa: 1 },
  ];
  assert.deepEqual(league.leaders(roster, stats).steals, [{ name: 'A', value: 1.5 }, { name: 'B', value: 1.5 }]);
});

test('Genius standings and the team summary last five', async () => {
  const standings = league.parseGeniusStandings(await fixture('genius-standings.html'));
  assert.deepEqual(standings[1], { position: 2, team_id: '178237', team: 'Bristol Flyers', played: 6, won: 4, lost: 2, points: 8 });

  const results = league.parseGeniusLastFive(await fixture('genius-summary.html'));
  assert.deepEqual(results[0], { date: '2026-10-18', opponent_name: 'Liverpool Basketball', home: true, for: 90, against: 89 });
  assert.equal(results[1].home, false);
});

test('EuroLeague people become a numbered roster of players only, with readable names', async () => {
  const roster = league.parseEuroleaguePeople(await fixture('euroleague-people.json'));
  assert.deepEqual(roster.map((p) => p.name), ['Maxwell Lewis III', "Joshua O'Garro", 'Landrius Horton']);
  assert.deepEqual(roster[2], { id: '015122', number: 23, name: 'Landrius Horton', position: 'G' });
});

test('EuroLeague statistics keep one club and join to its roster', async () => {
  const roster = league.parseEuroleaguePeople(await fixture('euroleague-people.json'));
  const stats = league.parseEuroleagueStatistics(await fixture('euroleague-statistics.json'), 'LLI');
  assert.equal(stats.length, 2);
  assert.deepEqual(league.joinRoster(roster, stats)[2].season, { pts: 5, reb: 3, ast: 1, min: 20 });
});

test('EuroLeague standings carry the group', async () => {
  const standings = league.parseEuroleagueStandings(await fixture('euroleague-standings.json'));
  assert.deepEqual(standings.find((r) => r.code === 'TTK'), { position: 8, code: 'TTK', team: 'Turk Telekom Ankara', group: 'B', played: 4, won: 1, lost: 3 });
});
