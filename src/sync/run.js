import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { writeSeasonIndex } from '../app/season.js';
import { loadConfig, ROOT } from './config.js';
import { crossCheck } from './crosscheck.js';
import { fetchText } from './fetch.js';
import { FEEDS, renderFeed } from './ics.js';
import { body, createNotice, isEmpty, subject } from './notice.js';
import { emptyState, reconcileCompetition, sortFixtures } from './reconcile.js';
import * as club from './sources/club.js';
import * as euroleague from './sources/euroleague.js';
import * as genius from './sources/genius.js';

const { values: args } = parseArgs({
  options: {
    state: { type: 'string', default: path.join(ROOT, 'data/fixtures.json') },
    feeds: { type: 'string', default: path.join(ROOT, 'feeds') },
    notice: { type: 'string', default: path.join(ROOT, 'out/notice.json') },
    from: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const now = new Date();
const config = await loadConfig();
const state = await loadState(args.state);
const { notice, change, warn, info } = createNotice(now);
const recorder = { change, warn, info };

for (const competition of config.competitions.filter((c) => c.source)) {
  let sourceFixtures;
  try {
    sourceFixtures = await readCompetition(competition);
  } catch (error) {
    recordFailure(competition.id, competition.name, error);
    continue;
  }
  recordRecovery(competition.id, competition.name);
  reconcileCompetition({ state, competition, sourceFixtures, config, notice: recorder, now });
}

try {
  const cards = club.parseCards(await readSource('club.html', club.SCHEDULE_URL));
  recordRecovery('club', 'club schedule page');
  crossCheck({ state, cards, config, notice: recorder, now });
} catch (error) {
  recordFailure('club', 'club schedule page', error);
}

for (const [id, override] of Object.entries(config.overrides)) {
  info(`${id}: ${Object.entries(override).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')}`);
}

sortFixtures(state);

if (!args['dry-run']) {
  await mkdir(path.dirname(args.state), { recursive: true });
  await writeFile(args.state, JSON.stringify(state, null, 2) + '\n');
  await mkdir(args.feeds, { recursive: true });
  for (const feed of Object.values(FEEDS)) {
    await writeFile(path.join(args.feeds, feed.file), renderFeed(feed, state.fixtures, config.competitions));
  }
  await writeSeasonIndex({ fixtures: state.fixtures, competitions: config.competitions, now });
}
await mkdir(path.dirname(args.notice), { recursive: true });
await writeFile(args.notice, JSON.stringify({ ...notice, subject: subject(notice), empty: isEmpty(notice) }, null, 2) + '\n');

process.stdout.write(isEmpty(notice) ? 'No changes.\n' : `${subject(notice)}\n\n${body(notice)}`);

async function loadState(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return emptyState();
    throw error;
  }
}

async function readSource(savedName, url) {
  if (args.from) return readFile(path.join(args.from, savedName), 'utf8');
  return fetchText(url);
}

async function readCompetition(competition) {
  const source = competition.source;
  if (source.kind === 'genius') {
    return genius.parseSchedule(await readSource(`genius-${source.competition_id}.html`, genius.scheduleUrl(source)), source);
  }
  if (source.kind === 'euroleague') {
    return euroleague.parseGames(await readSource(`euroleague-${source.season}.json`, euroleague.gamesUrl(source)), source);
  }
  throw new Error(`unknown source kind "${source.kind}" for ${competition.id}`);
}

function recordFailure(key, name, error) {
  const previous = state.sources[key];
  state.sources[key] = { failing: true, since: previous?.since ?? now.toISOString(), error: error.message };
  if (!previous?.failing) warn('source_failure', `${name} could not be read (${error.message}); its fixtures are frozen until it recovers`);
  process.stderr.write(`${name}: ${error.stack ?? error.message}\n`);
}

function recordRecovery(key, name) {
  if (state.sources[key]?.failing) warn('source_recovery', `${name} is readable again after failing since ${state.sources[key].since}`);
  delete state.sources[key];
}
