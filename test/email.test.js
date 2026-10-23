import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { emailSummary, failedStep, failureEmail, failureLines, gameMorningEmail } from '../src/programme/email.js';
import { pickFixture } from '../src/programme/today.js';

const bristol = () => JSON.parse(readFileSync(new URL('fixtures/programme/bristol.json', import.meta.url), 'utf8'));
const meta = { summary: 'Lions 6–0 host second-placed Bristol.', watch: 'Kennedy inside against Bristol threes.' };
const url = 'https://example.github.io/london-lions/programmes/2026-10-24-bristol-flyers/';

test('game-morning email: subject, four-line summary, button and iOS note', () => {
  const { subject, text, html } = gameMorningEmail({ data: bristol(), meta, failed: [], url });
  assert.equal(subject, 'Lions v Bristol Flyers, SLB Championship, 18:00');
  assert.deepEqual(text.split('\n').slice(0, 4), [
    'Copper Box Arena, Queen Elizabeth Olympic Park, London E20 3HB',
    'Tip-off 18:00, Saturday 24 October',
    meta.summary,
    meta.watch,
  ]);
  assert.match(html, new RegExp(`<a href="${url}"[^>]*>Open programme \\(saves it for offline\\)</a>`));
  assert.match(text, /open the link in Safari/);
});

test('a venue change leads the subject, and an away game reads "at"', () => {
  const data = bristol();
  data.fixture.venue_change = true;
  data.fixture.designated_home = false;
  assert.equal(gameMorningEmail({ data, meta, failed: [], url }).subject, 'Venue change: Lions at Bristol Flyers, SLB Championship, 18:00');
});

test('each failed source adds one footer line', () => {
  const failed = [{ label: 'Opposition news' }, { label: 'Highlights' }, { label: 'Highlights' }];
  assert.deepEqual(failureLines(failed), ['Opposition news unavailable this morning.', 'Highlights unavailable this morning.']);
  assert.match(gameMorningEmail({ data: bristol(), meta, failed, url }).text, /Opposition news unavailable this morning\./);
});

test('a missing or multi-line email summary fails', () => {
  assert.throws(() => emailSummary({ watch: 'w' }), /one-line "summary"/);
  assert.throws(() => emailSummary({ summary: 's', watch: 'two\nlines' }), /one-line "watch"/);
});

test('the failure email names the first failed step', () => {
  const step = failedStep('Install=success;Gather sources=success;Write the programme=failure;Render page and PDF=skipped');
  assert.equal(step, 'Write the programme');
  const { subject, text } = failureEmail({ fixture: bristol().fixture, step, runUrl: 'https://github.com/run/1' });
  assert.equal(subject, 'No programme today: Lions v Bristol Flyers');
  assert.match(text, /failed at "Write the programme"/);
});

test('the fixture for a UK date skips withdrawn fixtures; an id picks any fixture', () => {
  const fixtures = [
    { id: 'a', tipoff: '2026-10-24T17:00:00.000Z', status: 'withdrawn' },
    { id: 'b', tipoff: '2026-10-24T23:30:00.000Z', status: 'scheduled' },
    { id: 'c', tipoff: '2026-10-24T22:30:00.000Z', status: 'scheduled' },
  ];
  assert.equal(pickFixture(fixtures, { date: '2026-10-24' }).id, 'c', '23:30 UTC in October is the 25th in London');
  assert.equal(pickFixture(fixtures, { date: '2026-10-26' }), null);
  assert.equal(pickFixture(fixtures, { id: 'a' }).id, 'a');
  assert.throws(() => pickFixture(fixtures, { id: 'z' }), /No stored fixture has id z/);
});
