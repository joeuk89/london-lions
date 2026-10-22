import { icsStamp } from './time.js';

const DURATION_MS = 2 * 60 * 60 * 1000;

export const FEEDS = {
  all: { file: 'all.ics', name: 'London Lions fixtures', include: () => true },
  home: { file: 'home.ics', name: 'London Lions home fixtures', include: (f) => f.home },
  away: { file: 'away.ics', name: 'London Lions away fixtures', include: (f) => f.away },
};

function escapeText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (start === 0 ? 75 : 74), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((start === 0 ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
}

export function summary(fixture, competitionName) {
  const sides = fixture.designated_home
    ? `London Lions v ${fixture.opponent_name}`
    : `${fixture.opponent_name} v London Lions`;
  let text = `${sides} (${competitionName})`;
  if (fixture.venue_change) text += ' (venue change)';
  if (fixture.status === 'withdrawn') text = `CANCELLED: ${text}`;
  return text;
}

function description(fixture, competitionName) {
  const lines = [competitionName, fixture.home && fixture.away ? 'Neutral venue in London' : fixture.home ? 'Home' : 'Away'];
  if (fixture.venue_change) lines.push(`Venue change: ${fixture.venue.name}`);
  if (fixture.status === 'withdrawn') lines.push('Withdrawn by the competition; a new date will update this event.');
  if (fixture.source_url) lines.push(fixture.source_url);
  return lines.join('\n');
}

function event(fixture, competitionName) {
  const start = new Date(fixture.tipoff);
  const stamp = icsStamp(new Date(`${fixture.updated ?? fixture.first_seen}T00:00:00Z`));
  const lines = [
    'BEGIN:VEVENT',
    `UID:${fixture.id}`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
    `SEQUENCE:${fixture.sequence ?? 0}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(new Date(start.getTime() + DURATION_MS))}`,
    `SUMMARY:${escapeText(summary(fixture, competitionName))}`,
  ];
  if (fixture.venue) {
    lines.push(`LOCATION:${escapeText([fixture.venue.name, fixture.venue.address].filter(Boolean).join(', '))}`);
  }
  lines.push(`DESCRIPTION:${escapeText(description(fixture, competitionName))}`);
  lines.push(`STATUS:${fixture.status === 'withdrawn' ? 'CANCELLED' : 'CONFIRMED'}`);
  if (fixture.source_url) lines.push(`URL:${fixture.source_url}`);
  lines.push('END:VEVENT');
  return lines;
}

export function renderFeed(feed, fixtures, competitions) {
  const names = Object.fromEntries(competitions.map((c) => [c.id, c.name]));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//joeuk89/london-lions//fixture sync//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(feed.name)}`,
    'X-WR-TIMEZONE:Europe/London',
  ];
  for (const f of fixtures) {
    if (!f.tipoff || !feed.include(f)) continue;
    lines.push(...event(f, names[f.competition] ?? f.competition));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
