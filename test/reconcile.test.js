import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crossCheck } from '../src/sync/crosscheck.js';
import { createNotice } from '../src/sync/notice.js';
import { emptyState, reconcileCompetition } from '../src/sync/reconcile.js';

const competition = { id: 'slb-championship-2026-27', name: 'SLB Championship', club_labels: ['SLB Championship'] };
const config = () => ({
  competitions: [competition],
  venues: {
    'genius:1': { name: 'Copper Box Arena', address: 'London E20', in_london: true, home_venue: true },
    'genius:2': { name: 'Cheshire Oaks Arena', address: 'Ellesmere Port', in_london: false },
    'genius:3': { name: 'The O2', address: 'London SE10', in_london: true },
  },
  opponents: [{ key: 'cheshire-phoenix', name: 'Cheshire Phoenix', genius_team_id: '240' }],
  overrides: {},
});

const copperBox = { key: 'genius:1', name: 'Copper Box Arena' };
const cheshire = { name: 'Cheshire Phoenix', genius_team_id: '240' };

function source(overrides = {}) {
  return {
    source_id: 'genius:100',
    tipoff: new Date('2026-10-24T17:00:00Z'),
    designated_home: true,
    opponent: cheshire,
    venue: copperBox,
    status: 'scheduled',
    status_text: '',
    result: null,
    url: 'https://example.test/100',
    ...overrides,
  };
}

function run(state, sourceFixtures, { cfg = config(), day = '2026-10-22T07:00:00Z' } = {}) {
  const recorder = createNotice(new Date(day));
  reconcileCompetition({ state, competition, sourceFixtures, config: cfg, notice: recorder, now: new Date(day) });
  return recorder.notice;
}

test('first sight assigns an internal id and records "added"', () => {
  const state = emptyState();
  const notice = run(state, [source()]);
  assert.equal(state.fixtures.length, 1);
  const f = state.fixtures[0];
  assert.equal(f.id, 'slb-championship-2026-27-0001');
  assert.equal(f.source_id, 'genius:100');
  assert.equal(f.home, true);
  assert.equal(f.away, false);
  assert.equal(f.venue_change, false);
  assert.equal(f.sequence, 1);
  assert.deepEqual(notice.changes.map((c) => c.kind), ['added']);
});

test('a second run with the same data changes nothing', () => {
  const state = emptyState();
  run(state, [source()]);
  const before = JSON.stringify(state);
  const notice = run(state, [source()], { day: '2026-10-23T07:00:00Z' });
  assert.equal(JSON.stringify(state), before);
  assert.equal(notice.changes.length, 0);
});

test('a moved tip-off keeps the id and bumps the sequence', () => {
  const state = emptyState();
  run(state, [source()]);
  const notice = run(state, [source({ tipoff: new Date('2026-10-25T15:00:00Z') })], { day: '2026-10-23T07:00:00Z' });
  assert.equal(state.fixtures.length, 1);
  assert.equal(state.fixtures[0].sequence, 2);
  assert.deepEqual(notice.changes.map((c) => c.kind), ['tipoff_moved']);
  assert.match(notice.changes[0].text, /2026-10-24 18:00 → 2026-10-25 15:00/);
});

test('a home fixture away from the home venue is a venue change', () => {
  const state = emptyState();
  run(state, [source()]);
  const notice = run(state, [source({ venue: { key: 'genius:3', name: 'The O2' } })], { day: '2026-10-23T07:00:00Z' });
  assert.deepEqual(notice.changes.map((c) => c.kind), ['venue_changed']);
  assert.equal(state.fixtures[0].venue_change, true);
});

test('a neutral final in London where Lions are the away side is both home and away', () => {
  const state = emptyState();
  run(state, [source({ designated_home: false, venue: { key: 'genius:3', name: 'The O2' } })]);
  assert.equal(state.fixtures[0].home, true);
  assert.equal(state.fixtures[0].away, true);
});

test('an unknown venue classifies by designation and warns', () => {
  const state = emptyState();
  const notice = run(state, [source({ designated_home: false, venue: { key: 'genius:99', name: 'Somewhere Arena' } })]);
  assert.equal(state.fixtures[0].home, false);
  assert.equal(state.fixtures[0].away, true);
  assert.equal(state.fixtures[0].venue.name, 'Somewhere Arena');
  assert.deepEqual(notice.warnings.map((w) => w.kind), ['unknown_venue']);
});

test('withdrawn after two clean misses, kept, then reinstated under the same id', () => {
  const state = emptyState();
  run(state, [source()]);
  let notice = run(state, [], { day: '2026-10-23T07:00:00Z' });
  assert.equal(notice.changes.length, 0);
  assert.equal(state.fixtures[0].status, 'scheduled');
  notice = run(state, [], { day: '2026-10-24T07:00:00Z' });
  assert.deepEqual(notice.changes.map((c) => c.kind), ['status_changed']);
  assert.equal(state.fixtures[0].status, 'withdrawn');
  notice = run(state, [], { day: '2026-10-25T07:00:00Z' });
  assert.equal(notice.changes.length, 0, 'a withdrawn fixture is not withdrawn again');

  notice = run(state, [source({ source_id: 'genius:200', tipoff: new Date('2027-02-01T19:30:00Z') })], { day: '2026-10-26T07:00:00Z' });
  assert.equal(state.fixtures.length, 1, 'reissued fixture reuses the withdrawn record');
  assert.equal(state.fixtures[0].id, 'slb-championship-2026-27-0001');
  assert.equal(state.fixtures[0].source_id, 'genius:200');
  assert.equal(state.fixtures[0].status, 'scheduled');
  assert.deepEqual(notice.changes.map((c) => c.kind).sort(), ['status_changed', 'tipoff_moved']);
});

test('an explicit cancelled status withdraws at once', () => {
  const state = emptyState();
  run(state, [source()]);
  const notice = run(state, [source({ status: 'withdrawn', status_text: 'Postponed' })], { day: '2026-10-23T07:00:00Z' });
  assert.equal(state.fixtures[0].status, 'withdrawn');
  assert.deepEqual(notice.changes.map((c) => c.kind), ['status_changed']);
});

test('an override wins over the source and is applied once', () => {
  const state = emptyState();
  run(state, [source()]);
  const cfg = config();
  cfg.overrides['slb-championship-2026-27-0001'] = { tipoff: '2026-10-24T19:00:00Z' };
  let notice = run(state, [source()], { cfg, day: '2026-10-23T07:00:00Z' });
  assert.equal(state.fixtures[0].tipoff, '2026-10-24T19:00:00.000Z');
  assert.deepEqual(notice.changes.map((c) => c.kind), ['tipoff_moved']);
  notice = run(state, [source()], { cfg, day: '2026-10-24T07:00:00Z' });
  assert.equal(notice.changes.length, 0);
});

test('club cross-check reports disagreements and unmatched cards without touching state', () => {
  const state = emptyState();
  run(state, [source()]);
  const before = JSON.stringify(state);
  const recorder = createNotice(new Date('2026-10-22T07:00:00Z'));
  crossCheck({
    state,
    cards: [
      { league: 'SLB Championship', date: '2026-10-24', time: '19:00', designated_home: true, opponent_name: 'Cheshire Phoenix', flag: 'HOME', venue_name: 'Copper Box Arena', cancelled: false },
      { league: 'SLB Championship', date: '2026-12-01', time: '19:00', designated_home: false, opponent_name: 'Cheshire Phoenix', flag: 'AWAY', venue_name: null, cancelled: false },
      { league: 'SLB Trophy', date: '2026-12-14', time: '19:00', designated_home: true, opponent_name: 'Cheshire Phoenix', flag: 'HOME', venue_name: null, cancelled: false },
      { league: 'SLB Trophy', date: '2025-12-14', time: '19:00', designated_home: true, opponent_name: 'Cheshire Phoenix', flag: 'HOME', venue_name: null, cancelled: false },
    ],
    config: config(),
    notice: recorder,
    now: new Date('2026-10-22T07:00:00Z'),
  });
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(recorder.notice.warnings.map((w) => w.kind), ['source_disagreement', 'club_card_unmatched', 'untracked_competition']);
  assert.match(recorder.notice.warnings[0].text, /club page says 19:00, source says 18:00/);
});
