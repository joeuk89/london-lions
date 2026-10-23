import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { programmePath, ukDate } from '../app/season.js';
import { ROOT } from '../sync/config.js';
import { fixtureTitle } from './email.js';

export function pickFixture(fixtures, { id, date }) {
  if (id) {
    const fixture = fixtures.find((f) => f.id === id);
    if (!fixture) throw new Error(`No stored fixture has id ${id}`);
    return fixture;
  }
  return fixtures.find((f) => ukDate(f.tipoff) === date && f.status !== 'withdrawn') ?? null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({
    options: {
      fixture: { type: 'string' },
      date: { type: 'string', default: ukDate(new Date()) },
      state: { type: 'string', default: path.join(ROOT, 'data/fixtures.json') },
    },
  });
  const { fixtures } = JSON.parse(await readFile(args.state, 'utf8'));
  const { site_url: site } = JSON.parse(await readFile(path.join(ROOT, 'config/programme.json'), 'utf8'));
  const fixture = pickFixture(fixtures, { id: args.fixture || null, date: args.date });
  const outputs = fixture
    ? {
      found: 'true',
      id: fixture.id,
      dir: programmePath(fixture),
      url: new URL(programmePath(fixture), site).href,
      title: `${fixtureTitle(fixture)}, ${ukDate(fixture.tipoff)}`,
    }
    : { found: 'false' };
  console.log(fixture ? `Programme for ${fixture.id} (${fixture.opponent_name})` : `No Lions fixture on ${args.date}.`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([k, v]) => `${k}=${v}\n`).join(''));
  }
}
