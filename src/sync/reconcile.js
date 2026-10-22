import { resolveOpponent, resolveVenue } from './config.js';
import { ukDate, ukDateTime } from './time.js';

export const CHANGE_KINDS = ['added', 'tipoff_moved', 'venue_changed', 'status_changed', 'home_away_flipped'];
const MISSES_BEFORE_WITHDRAWN = 2;

export function emptyState() {
  return { fixtures: [], counters: {}, sources: {} };
}

function nextId(state, competitionId) {
  const n = (state.counters[competitionId] ?? 0) + 1;
  state.counters[competitionId] = n;
  return `${competitionId}-${String(n).padStart(4, '0')}`;
}

function classify(designatedHome, venue) {
  if (!venue || venue.in_london === null) return { home: designatedHome, away: !designatedHome };
  return { home: designatedHome || venue.in_london, away: !designatedHome || !venue.in_london };
}

function describeVenue(v) {
  return v ? v.name : 'unknown venue';
}

function describeTipoff(iso) {
  return iso ? ukDateTime(new Date(iso)) : 'no date';
}

function applyOverride(fixture, override, venues) {
  if (!override) return;
  if (override.tipoff) fixture.tipoff = new Date(override.tipoff).toISOString();
  if (override.venue) {
    fixture.venue = typeof override.venue === 'string'
      ? stripKnown(resolveVenue(venues, { key: override.venue, name: override.venue }))
      : { key: 'override', name: override.venue.name, address: override.venue.address ?? null, in_london: override.venue.in_london ?? null, home_venue: false };
  }
  if (override.status) fixture.status = override.status;
}

function stripKnown(venue) {
  if (!venue) return null;
  const { known, ...rest } = venue;
  return rest;
}

// Turns one competition's source fixtures into the next state, recording changes and warnings on the notice.
export function reconcileCompetition({ state, competition, sourceFixtures, config, notice, now }) {
  const runDate = ukDate(now);
  const seen = new Set();
  const byId = new Map(state.fixtures.filter((f) => f.source_id).map((f) => [f.source_id, f]));
  const inCompetition = (f) => f.competition === competition.id;

  for (const sf of sourceFixtures) {
    const opponent = resolveOpponent(config.opponents, sf.opponent);
    if (!opponent.known) notice.warn('unknown_opponent', `${competition.name}: opponent "${opponent.name}" is not in opponents.json, keyed as "${opponent.key}"`);
    const venue = resolveVenue(config.venues, sf.venue);
    const tipoff = sf.tipoff ? sf.tipoff.toISOString() : null;
    const date = sf.tipoff ? ukDate(sf.tipoff) : null;

    let fixture = byId.get(sf.source_id)
      ?? state.fixtures.find((f) => inCompetition(f) && !f.source_id && f.opponent === opponent.key && f.tipoff && ukDate(new Date(f.tipoff)) === date)
      ?? state.fixtures.find((f) => inCompetition(f) && f.status === 'withdrawn' && f.opponent === opponent.key && !seen.has(f.id));

    const isNew = !fixture;
    if (isNew) {
      fixture = { id: nextId(state, competition.id), competition: competition.id, first_seen: runDate, sequence: 0 };
      state.fixtures.push(fixture);
    }
    const before = { ...fixture, venue: fixture.venue ? { ...fixture.venue } : null };

    fixture.source_id = sf.source_id;
    fixture.source_url = sf.url;
    fixture.opponent = opponent.key;
    fixture.opponent_name = opponent.name;
    fixture.designated_home = sf.designated_home;
    fixture.tipoff = tipoff;
    fixture.venue = stripKnown(venue);
    fixture.status = sf.status === 'withdrawn' ? 'withdrawn' : 'scheduled';
    fixture.played = sf.status === 'played';
    fixture.result = sf.result ?? fixture.result ?? null;
    fixture.misses = 0;

    if (sf.status === 'unknown') notice.warn('unfamiliar_status', `${label(fixture)}: source status "${sf.status_text}" is not one the sync knows; treating as scheduled`);
    if (venue && !venue.known) notice.warn('unknown_venue', `${label(fixture)}: venue "${venue.name}" (${venue.key}) is not in venues.json; classified by designation only`);

    applyOverride(fixture, config.overrides[fixture.id], config.venues);
    Object.assign(fixture, classify(fixture.designated_home, fixture.venue));
    fixture.venue_change = Boolean(fixture.designated_home && fixture.venue && !fixture.venue.home_venue);

    seen.add(fixture.id);
    if (isNew) {
      notice.change('added', fixture, `${label(fixture)}: ${describeTipoff(fixture.tipoff)} at ${describeVenue(fixture.venue)}`);
      touch(fixture, runDate);
      continue;
    }
    recordChanges(before, fixture, notice, runDate);
  }

  for (const fixture of state.fixtures.filter(inCompetition)) {
    if (seen.has(fixture.id) || fixture.status === 'withdrawn') continue;
    fixture.misses = (fixture.misses ?? 0) + 1;
    if (fixture.misses >= MISSES_BEFORE_WITHDRAWN && !config.overrides[fixture.id]?.status) {
      fixture.status = 'withdrawn';
      touch(fixture, runDate);
      notice.change('status_changed', fixture, `${label(fixture)}: withdrawn (missing from ${competition.name} source for ${fixture.misses} runs)`);
    }
  }
}

function recordChanges(before, after, notice, runDate) {
  const changed = [];
  if (before.tipoff !== after.tipoff) {
    changed.push(['tipoff_moved', `${describeTipoff(before.tipoff)} → ${describeTipoff(after.tipoff)}`]);
  }
  if ((before.venue?.key ?? null) !== (after.venue?.key ?? null) || (before.venue?.name ?? null) !== (after.venue?.name ?? null)) {
    changed.push(['venue_changed', `${describeVenue(before.venue)} → ${describeVenue(after.venue)}`]);
  }
  if (before.status !== after.status) {
    changed.push(['status_changed', after.status === 'withdrawn' ? 'withdrawn' : 'reinstated']);
  }
  if (before.home !== after.home || before.away !== after.away) {
    changed.push(['home_away_flipped', `${sideText(before)} → ${sideText(after)}`]);
  }
  if (changed.length === 0) return;
  touch(after, runDate);
  for (const [kind, detail] of changed) notice.change(kind, after, `${label(after)}: ${detail}`);
}

function sideText(f) {
  if (f.home && f.away) return 'home and away';
  return f.home ? 'home' : 'away';
}

function touch(fixture, runDate) {
  fixture.sequence = (fixture.sequence ?? 0) + 1;
  fixture.updated = runDate;
}

export function label(fixture) {
  const date = fixture.tipoff ? ukDate(new Date(fixture.tipoff)) : 'TBC';
  return `${date} ${fixture.designated_home ? 'London Lions v ' + fixture.opponent_name : fixture.opponent_name + ' v London Lions'}`;
}

export function sortFixtures(state) {
  state.fixtures.sort((a, b) => (a.tipoff ?? '9999').localeCompare(b.tipoff ?? '9999') || a.id.localeCompare(b.id));
}
