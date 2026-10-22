import { competitionForClubLabel, resolveOpponent, venueKeyByName } from './config.js';
import { label } from './reconcile.js';
import { daysBetween, ukDate, ukTime } from './time.js';

const MAX_DAYS_APART = 14;

// Compares the club schedule page with the synced fixtures. Nothing here changes state: every difference is a warning.
export function crossCheck({ state, cards, config, notice, now }) {
  const untracked = new Set();
  const upcoming = state.fixtures.filter((f) => !f.played);
  const today = ukDate(now);

  for (const card of cards) {
    if (!card.date || card.date < today) continue;
    const competition = competitionForClubLabel(config.competitions, card.league);
    if (!competition) {
      if (!untracked.has(card.league)) {
        untracked.add(card.league);
        notice.warn('untracked_competition', `club page lists "${card.league}" fixtures (first: ${card.date} v ${card.opponent_name}) but competitions.json has no source for it`);
      }
      continue;
    }
    const opponent = resolveOpponent(config.opponents, { name: card.opponent_name });
    const candidates = upcoming
      .filter((f) => f.competition === competition.id && f.opponent === opponent.key && f.tipoff)
      .map((f) => ({ f, days: daysBetween(ukDate(new Date(f.tipoff)), card.date) }))
      .filter((c) => c.days <= MAX_DAYS_APART)
      .sort((a, b) => a.days - b.days);
    if (candidates.length === 0) {
      notice.warn('club_card_unmatched', `club page shows ${card.date} ${card.designated_home ? 'London Lions v ' + card.opponent_name : card.opponent_name + ' v London Lions'} (${card.league}) but no ${competition.name} fixture against ${opponent.name} is within ${MAX_DAYS_APART} days`);
      continue;
    }
    const fixture = candidates[0].f;
    const differences = compare(card, fixture, config.venues);
    for (const d of differences) notice.warn('source_disagreement', `${label(fixture)}: ${d}`);
  }
}

function compare(card, fixture, venues) {
  const out = [];
  const tipoff = new Date(fixture.tipoff);
  if (card.date !== ukDate(tipoff)) out.push(`club page says ${card.date}, source says ${ukDate(tipoff)}`);
  if (card.time && card.time !== ukTime(tipoff)) out.push(`club page says ${card.time}, source says ${ukTime(tipoff)}`);
  if (card.designated_home !== fixture.designated_home) out.push(`club page lists ${card.designated_home ? 'Lions' : card.opponent_name} as home side, source lists ${fixture.designated_home ? 'Lions' : fixture.opponent_name}`);
  if (card.venue_name && fixture.venue) {
    const cardKey = venueKeyByName(venues, card.venue_name);
    const sameName = (venues[fixture.venue.key]?.aliases ?? [fixture.venue.name]).concat(fixture.venue.name)
      .some((n) => n.toLowerCase() === card.venue_name.toLowerCase());
    if (!sameName && cardKey !== fixture.venue.key) out.push(`club page venue "${card.venue_name}", source venue "${fixture.venue.name}"`);
  }
  if (card.cancelled && fixture.status !== 'withdrawn') out.push('club page marks it Cancelled/Forfeited, source still lists it');
  return out;
}
