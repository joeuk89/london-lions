import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UK, ukDate, ukTime, zonedToUtc } from '../src/sync/time.js';

test('UK local time converts to UTC across the clock change', () => {
  assert.equal(zonedToUtc(UK, { year: 2026, month: 10, day: 24, hour: 18, minute: 0 }).toISOString(), '2026-10-24T17:00:00.000Z');
  assert.equal(zonedToUtc(UK, { year: 2026, month: 11, day: 22, hour: 16, minute: 0 }).toISOString(), '2026-11-22T16:00:00.000Z');
});

test('UK date and time read back from a UTC instant', () => {
  const instant = new Date('2026-10-24T17:00:00Z');
  assert.equal(ukDate(instant), '2026-10-24');
  assert.equal(ukTime(instant), '18:00');
  assert.equal(ukDate(new Date('2026-10-24T23:30:00Z')), '2026-10-25');
});
