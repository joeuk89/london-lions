import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEDS, renderFeed, summary } from '../src/sync/ics.js';
import { body, createNotice, isEmpty, subject } from '../src/sync/notice.js';

const competitions = [{ id: 'slb-cup-2026-27', name: 'SLB Cup' }];

const fixture = (overrides = {}) => ({
  id: 'slb-cup-2026-27-0001',
  competition: 'slb-cup-2026-27',
  first_seen: '2026-10-22',
  updated: '2026-10-23',
  sequence: 2,
  source_url: 'https://example.test/1',
  opponent: 'cheshire-phoenix',
  opponent_name: 'Cheshire Phoenix',
  designated_home: false,
  tipoff: '2027-02-15T15:00:00.000Z',
  venue: { key: 'genius:3', name: 'The O2', address: 'Peninsula Square, London SE10 0DX', in_london: true, home_venue: false },
  status: 'scheduled',
  home: true,
  away: true,
  venue_change: false,
  ...overrides,
});

test('summary text follows designation, competition, venue change and withdrawal', () => {
  assert.equal(summary(fixture(), 'SLB Cup'), 'Cheshire Phoenix v London Lions (SLB Cup)');
  assert.equal(summary(fixture({ designated_home: true, venue_change: true }), 'SLB Cup'), 'London Lions v Cheshire Phoenix (SLB Cup) (venue change)');
  assert.equal(summary(fixture({ status: 'withdrawn' }), 'SLB Cup'), 'CANCELLED: Cheshire Phoenix v London Lions (SLB Cup)');
});

test('a neutral London final appears in all three feeds with a two-hour UTC event', () => {
  for (const feed of Object.values(FEEDS)) {
    const ics = renderFeed(feed, [fixture()], competitions);
    assert.match(ics, /UID:slb-cup-2026-27-0001\r\n/);
    assert.match(ics, /DTSTART:20270215T150000Z\r\n/);
    assert.match(ics, /DTEND:20270215T170000Z\r\n/);
    assert.match(ics, /SEQUENCE:2\r\n/);
    assert.match(ics, /LOCATION:The O2\\, Peninsula Square\\, London SE10 0DX\r\n/);
    assert.match(ics, /STATUS:CONFIRMED\r\n/);
  }
});

test('home and away feeds filter on the classification', () => {
  const homeOnly = fixture({ home: true, away: false });
  assert.match(renderFeed(FEEDS.home, [homeOnly], competitions), /BEGIN:VEVENT/);
  assert.doesNotMatch(renderFeed(FEEDS.away, [homeOnly], competitions), /BEGIN:VEVENT/);
});

test('a withdrawn fixture stays in the feed as cancelled', () => {
  const ics = renderFeed(FEEDS.all, [fixture({ status: 'withdrawn' })], competitions);
  assert.match(ics, /STATUS:CANCELLED\r\n/);
  assert.match(ics, /SUMMARY:CANCELLED: Cheshire Phoenix/);
});

test('long lines fold at 75 octets', () => {
  const ics = renderFeed(FEEDS.all, [fixture({ source_url: 'https://example.test/' + 'x'.repeat(120) })], competitions);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
});

test('notice subject counts changes by kind and the body groups them', () => {
  const recorder = createNotice(new Date('2026-10-22T07:00:00Z'));
  assert.equal(isEmpty(recorder.notice), true);
  recorder.change('added', { id: 'a' }, 'A added');
  recorder.change('tipoff_moved', { id: 'b' }, 'B moved');
  recorder.change('tipoff_moved', { id: 'c' }, 'C moved');
  recorder.warn('unknown_venue', 'D venue');
  assert.equal(isEmpty(recorder.notice), false);
  assert.equal(subject(recorder.notice), 'Lions fixtures: 1 added, 2 moved');
  const text = body(recorder.notice);
  assert.match(text, /Added \(1\)\n  A added\n\nTip-off moved \(2\)\n  B moved\n  C moved\n\nWarnings \(1\)\n  \[unknown_venue\] D venue/);
});

test('warnings alone still make a subject', () => {
  const recorder = createNotice(new Date());
  recorder.warn('source_failure', 'x');
  assert.equal(subject(recorder.notice), 'Lions fixtures: 1 warning');
});
