import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadConfig, resolveOpponent, ROOT } from '../sync/config.js';
import { fetchText } from '../sync/fetch.js';
import * as euroleague from '../sync/sources/euroleague.js';
import * as genius from '../sync/sources/genius.js';
import * as league from './league.js';
import * as news from './news.js';

const LIONS = 'London Lions';
const LIONS_NAMES = [LIONS, 'Lions'];
const ARTICLES_PER_SOURCE = 10;
const FULL_TEXT = 300;
const GENIUS_PUBLISHER = 'Genius Sports (SLB)';
const EUROLEAGUE_PUBLISHER = 'EuroLeague';

const byNewest = (a, b) => String(b.date ?? b.tipoff).localeCompare(String(a.date ?? a.tipoff));

export async function fetchWithRetry(url, { fetch = fetchText, attempts = 5, pause = 2000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(url);
    } catch (error) {
      if (attempt >= attempts) throw error;
      await sleep(pause * attempt);
    }
  }
}

// Builds the template's data file and the source bundle for one stored fixture.
export async function gather({ fixture, state, config, programme, now = new Date(), fetch = fetchText, pause = 2000 }) {
  const get = (url) => fetchWithRetry(url, { fetch, pause });
  const getJson = async (url) => JSON.parse(await get(url));
  const sources = {};
  const dataSources = new Set();
  const failed = [];
  const notes = [];
  const cite = (id, entry) => {
    sources[id] = entry;
    dataSources.add(id);
    return id;
  };

  const competitions = new Map(config.competitions.map((c) => [c.id, c]));
  const competition = competitions.get(fixture.competition);
  if (!competition) throw new Error(`Fixture ${fixture.id} is in unknown competition ${fixture.competition}`);
  const statsCompetition = competitions.get(competition.stats_from ?? competition.id);
  const short = (id) => competitions.get(id)?.short_name ?? competitions.get(id)?.name ?? id;
  const opponentEntry = config.opponents.find((o) => o.key === fixture.opponent);
  if (!opponentEntry) notes.push(`${fixture.opponent_name} is missing from the opponents table, so its news is omitted.`);
  const canonical = (ref) => (ref.name === LIONS ? LIONS : resolveOpponent(config.opponents, ref).name);

  const teams = statsCompetition.source.kind === 'genius'
    ? await geniusTeams()
    : await euroleagueTeams();

  async function geniusTeams() {
    const source = statsCompetition.source;
    const opponentId = opponentEntry?.genius_team_id;
    if (!opponentId) throw new Error(`${fixture.opponent_name} has no genius_team_id in the opponents table`);
    const lionsUrls = league.geniusUrls(source.competition_id, source.team_id);
    const opponentUrls = league.geniusUrls(source.competition_id, opponentId);
    const [standingsHtml, lionsRoster, lionsStats, opponentSummary, opponentRoster, opponentStats] = await Promise.all([
      get(lionsUrls.standings), get(lionsUrls.roster), get(lionsUrls.statistics),
      get(opponentUrls.summary), get(opponentUrls.roster), get(opponentUrls.statistics),
    ]);
    const standings = league.parseGeniusStandings(standingsHtml);
    const record = (teamId) => {
      const row = standings.find((r) => r.team_id === teamId);
      if (!row) throw new Error(`Team ${teamId} is missing from the ${statsCompetition.name} standings`);
      return { position: row.position, won: row.won, lost: row.lost };
    };
    const team = (rosterHtml, statsHtml) => {
      const roster = league.parseGeniusRoster(rosterHtml);
      const stats = league.parseGeniusStatistics(statsHtml);
      return { roster: league.joinRoster(roster, stats), leaders: league.leaders(roster, stats) };
    };
    cite('gs-standings', { publisher: GENIUS_PUBLISHER, title: `${statsCompetition.name} standings`, url: lionsUrls.standings });
    cite('gs-lions-roster', { publisher: GENIUS_PUBLISHER, title: 'Lions roster', url: lionsUrls.roster });
    cite('gs-lions-stats', { publisher: GENIUS_PUBLISHER, title: 'Lions player statistics', url: lionsUrls.statistics });
    cite('gs-opponent', { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} summary`, url: opponentUrls.summary });
    cite('gs-opponent-roster', { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} roster`, url: opponentUrls.roster });
    cite('gs-opponent-stats', { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} player statistics`, url: opponentUrls.statistics });
    return {
      lions: { record: record(source.team_id), ...team(lionsRoster, lionsStats) },
      opponent: {
        record: record(opponentId),
        ...team(opponentRoster, opponentStats),
        results: league.parseGeniusLastFive(opponentSummary).map((r) => ({
          ...r, competition_name: short(statsCompetition.id), opponent_name: canonical({ name: r.opponent_name }),
        })),
      },
    };
  }

  async function euroleagueTeams() {
    const source = statsCompetition.source;
    const opponentCode = opponentEntry?.euroleague_code;
    if (!opponentCode) throw new Error(`${fixture.opponent_name} has no euroleague_code in the opponents table`);
    const lionsUrls = league.euroleagueUrls(source, source.club_code);
    const opponentUrls = league.euroleagueUrls(source, opponentCode);
    const gamesUrl = euroleague.gamesUrl(source);
    const [games, lionsPeople, opponentPeople, statistics] = await Promise.all([
      getJson(gamesUrl), getJson(lionsUrls.people), getJson(opponentUrls.people), getJson(lionsUrls.statistics),
    ]);
    const round = Math.max(1, ...games.data.filter((g) => g.played).map((g) => g.round));
    const standings = league.parseEuroleagueStandings(await getJson(lionsUrls.standings(round)));
    const record = (code) => {
      const row = standings.find((r) => r.code === code);
      if (!row) throw new Error(`Club ${code} is missing from the EuroCup standings`);
      return { position: row.position, won: row.won, lost: row.lost };
    };
    const team = (peopleJson, code) => {
      const roster = league.parseEuroleaguePeople(peopleJson);
      const stats = league.parseEuroleagueStatistics(statistics, code);
      return { roster: league.joinRoster(roster, stats), leaders: league.leaders(roster, stats) };
    };
    cite('el-games', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} games`, url: gamesUrl });
    cite('el-standings', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} standings after round ${round}`, url: lionsUrls.standings(round) });
    cite('el-stats', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} player statistics`, url: lionsUrls.statistics });
    cite('el-lions-roster', { publisher: EUROLEAGUE_PUBLISHER, title: 'Lions roster', url: lionsUrls.people });
    cite('el-opponent-roster', { publisher: EUROLEAGUE_PUBLISHER, title: `${fixture.opponent_name} roster`, url: opponentUrls.people });
    const results = euroleague.parseGames(games, { club_code: opponentCode })
      .filter((g) => g.result)
      .map((g) => ({
        date: g.tipoff.toISOString(),
        competition_name: short(statsCompetition.id),
        opponent_name: canonical({ name: g.opponent.name, euroleague_code: g.opponent.euroleague_code }),
        home: g.designated_home,
        for: g.result.lions,
        against: g.result.opponent,
      }))
      .sort(byNewest);
    return {
      lions: { record: record(source.club_code), ...team(lionsPeople, source.club_code) },
      opponent: { record: record(opponentCode), ...team(opponentPeople, opponentCode), results },
      standings,
    };
  }

  const before = state.fixtures.filter((f) => f.tipoff < fixture.tipoff && f.result).sort(byNewest);
  const lionsResults = before.slice(0, 5).map((f) => ({
    date: f.tipoff,
    competition_name: short(f.competition),
    opponent_name: f.opponent_name,
    home: f.designated_home,
    for: f.result.lions,
    against: f.result.opponent,
  }));
  for (const id of new Set(before.slice(0, 5).map((f) => f.competition))) {
    const c = competitions.get(id);
    if (c.source.kind === 'genius') {
      cite(`gs-schedule-${c.source.competition_id}`, { publisher: GENIUS_PUBLISHER, title: `Lions ${c.name} fixtures and results`, url: genius.scheduleUrl(c.source) });
    } else {
      cite('el-games', { publisher: EUROLEAGUE_PUBLISHER, title: `${c.name} games`, url: euroleague.gamesUrl(c.source) });
    }
  }

  const table = await leagueTable();
  async function leagueTable() {
    if (competition.source.kind === 'euroleague') {
      const group = teams.standings.find((r) => r.code === competition.source.club_code)?.group;
      const rows = teams.standings.filter((r) => r.group === group);
      return {
        competition_name: `${competition.name} group ${group}`,
        rows: rows.map((r) => ({ team: canonical({ name: r.team, euroleague_code: r.code }), played: r.played, won: r.won, lost: r.lost })),
      };
    }
    const url = league.geniusUrls(competition.source.competition_id, competition.source.team_id).standings;
    let rows;
    try {
      rows = league.parseGeniusStandings(await get(url));
    } catch (error) {
      failed.push({ label: 'League table', url, error: error.message });
      return null;
    }
    if (rows.length === 0) return null;
    cite(competition.id === statsCompetition.id ? 'gs-standings' : 'gs-table', { publisher: GENIUS_PUBLISHER, title: `${competition.name} standings`, url });
    return {
      competition_name: competition.name,
      rows: rows.map((r) => ({
        team: r.team_id === competition.source.team_id ? LIONS : canonical({ name: r.team, genius_team_id: r.team_id }),
        played: r.played, won: r.won, lost: r.lost, points: r.points,
      })),
    };
  }

  const headToHead = await meetings();
  async function meetings() {
    const thisSeason = before.filter((f) => f.opponent === fixture.opponent);
    if (thisSeason.length > 0) {
      return {
        scope: 'this-season',
        meetings: thisSeason.map((f) => ({
          date: f.tipoff, competition_name: short(f.competition), home: f.designated_home,
          venue_name: f.venue?.name ?? '', lions: f.result.lions, opponent: f.result.opponent,
        })),
      };
    }
    return { scope: 'last-season', meetings: await lastSeason() };
  }

  // The Lions' Genius schedule page lists last season's results under this season's fixtures;
  // the EuroLeague API serves last season by its season code.
  async function lastSeason() {
    const seasonStart = state.fixtures.map((f) => f.tipoff).sort()[0];
    if (opponentEntry?.genius_team_id) {
      const c = config.competitions.find((x) => x.source.kind === 'genius' && !x.stats_from);
      const url = genius.scheduleUrl(c.source);
      const rows = genius.parseSchedule(await get(url), c.source);
      cite(`gs-schedule-${c.source.competition_id}`, { publisher: GENIUS_PUBLISHER, title: `Lions ${c.name} fixtures and results`, url });
      return rows
        .filter((r) => r.result && r.tipoff && r.tipoff.toISOString() < seasonStart && r.opponent.genius_team_id === opponentEntry.genius_team_id)
        .map((r) => ({ date: r.tipoff.toISOString(), competition_name: 'SLB', home: r.designated_home, venue_name: r.venue?.name ?? '', lions: r.result.lions, opponent: r.result.opponent }))
        .sort(byNewest);
    }
    if (opponentEntry?.euroleague_code) {
      const c = config.competitions.find((x) => x.source.kind === 'euroleague');
      const previous = { ...c.source, season: c.source.season.replace(/\d{4}$/, (y) => String(Number(y) - 1)) };
      const url = euroleague.gamesUrl(previous);
      const games = euroleague.parseGames(await get(url), previous);
      cite('el-games-last-season', { publisher: EUROLEAGUE_PUBLISHER, title: `${c.name} games last season`, url });
      return games
        .filter((g) => g.result && g.opponent.euroleague_code === opponentEntry.euroleague_code)
        .map((g) => ({ date: g.tipoff.toISOString(), competition_name: short(c.id), home: g.designated_home, venue_name: g.venue?.name ?? '', lions: g.result.lions, opponent: g.result.opponent }))
        .sort(byNewest);
    }
    return [];
  }

  const next = state.fixtures
    .filter((f) => f.tipoff > fixture.tipoff && f.status !== 'withdrawn')
    .sort((a, b) => a.tipoff.localeCompare(b.tipoff))
    .slice(0, 4)
    .map((f) => ({
      tipoff: f.tipoff, competition_name: short(f.competition), opponent_name: f.opponent_name,
      home: f.designated_home, venue_name: f.venue?.name ?? 'Venue to be confirmed', venue_change: f.venue_change,
    }));

  const windows = {
    lions_news_since: news.newsWindow(now, lionsResults[0]?.date),
    opponent_news_since: news.newsWindow(now, teams.opponent.results[0]?.date),
    highlights_since: news.highlightsWindow(now),
  };

  const articles = [];
  const counters = {};
  const nextId = (prefix) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };

  async function readItems(feed) {
    const listing = await get(feed.url);
    if (feed.kind === 'rss') return news.parseFeed(listing);
    return news.parseListing(listing, feed);
  }

  async function addArticles({ feed, prefix, publisher, label, keep }) {
    let items;
    try {
      items = await readItems(feed);
    } catch (error) {
      failed.push({ label, url: feed.url, error: error.message });
      return;
    }
    const kept = items.map((item) => ({ item, scope: keep(item) })).filter(({ scope }) => scope);
    for (const { item, scope } of kept.slice(0, ARTICLES_PER_SOURCE)) {
      let text = item.html ? news.htmlToText(item.html) : '';
      if (text.length < FULL_TEXT) {
        try {
          text = news.articleText(await get(item.url));
        } catch (error) {
          notes.push(`Could not read ${item.url}: ${error.message}`);
          continue;
        }
      }
      const id = nextId(prefix);
      sources[id] = { publisher, title: item.title, url: item.url, published: item.published };
      articles.push({ id, scope, publisher, title: item.title, url: item.url, published: item.published, text });
    }
  }

  const opponentNames = [fixture.opponent_name, ...(opponentEntry?.aliases ?? [])];
  const since = (item, from) => item.published && item.published >= from;
  const byMention = (item) => {
    if (news.mentions(item, LIONS_NAMES) && since(item, windows.lions_news_since)) return 'lions';
    if (news.mentions(item, opponentNames) && since(item, windows.opponent_news_since)) return 'opponent';
    return null;
  };

  await addArticles({
    feed: programme.club_news, prefix: 'club', publisher: LIONS, label: 'Lions club news',
    keep: (item) => (since(item, windows.lions_news_since) ? 'lions' : null),
  });
  await addArticles({ feed: programme.hoopsfix, prefix: 'hf', publisher: 'Hoopsfix', label: 'Hoopsfix news', keep: byMention });
  if (opponentEntry?.news) {
    await addArticles({
      feed: opponentEntry.news, prefix: 'opp', publisher: fixture.opponent_name, label: 'Opposition news',
      keep: (item) => (since(item, windows.opponent_news_since) ? 'opponent' : null),
    });
  } else if (opponentEntry) {
    notes.push(`${fixture.opponent_name} has no club news source in the opponents table.`);
  }

  async function highlights(channelId, id, title) {
    if (!channelId) return [];
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    try {
      const videos = news.parseFeed(await get(url))
        .filter((v) => v.published >= windows.highlights_since && news.isHighlight(v.title))
        .map((v) => ({ title: news.tidyVideoTitle(v.title), url: v.url, published: v.published }));
      if (videos.length > 0) cite(id, { publisher: 'YouTube', title, url });
      return videos;
    } catch (error) {
      failed.push({ label: 'Highlights', url, error: error.message });
      return [];
    }
  }

  const venue = config.venues[fixture.venue?.key];
  const data = {
    gathered_at: now.toISOString(),
    fixture: {
      ...fixture,
      competition_name: competition.name,
      venue: { ...fixture.venue, ...(venue?.directions ? { directions: venue.directions } : {}) },
    },
    lions: {
      name: LIONS,
      record: teams.lions.record,
      leaders: teams.lions.leaders,
      results: lionsResults,
      highlights: await highlights(programme.youtube_channel_id, 'yt-lions', 'London Lions channel feed'),
      roster: teams.lions.roster,
    },
    opponent: {
      name: fixture.opponent_name,
      record: teams.opponent.record,
      leaders: teams.opponent.leaders,
      results: teams.opponent.results.slice(0, 5),
      highlights: await highlights(opponentEntry?.youtube_channel_id, 'yt-opponent', `${fixture.opponent_name} channel feed`),
      roster: teams.opponent.roster,
    },
    head_to_head: headToHead,
    table,
    next,
    data_sources: [...dataSources],
    sources,
  };
  const bundle = { fixture_id: fixture.id, gathered_at: now.toISOString(), windows, failed, notes, articles };
  return { data, bundle };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: path.join(ROOT, 'out/run') },
      state: { type: 'string', default: path.join(ROOT, 'data/fixtures.json') },
    },
  });
  if (!args.fixture) {
    console.error('Usage: node src/programme/gather.js --fixture <id> [--out <dir>]');
    process.exit(2);
  }
  const state = JSON.parse(await readFile(args.state, 'utf8'));
  const fixture = state.fixtures.find((f) => f.id === args.fixture);
  if (!fixture) throw new Error(`No stored fixture has id ${args.fixture}`);
  const config = await loadConfig();
  const programme = JSON.parse(await readFile(path.join(ROOT, 'config/programme.json'), 'utf8'));
  const { data, bundle } = await gather({ fixture, state, config, programme });
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(path.join(args.out, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  for (const f of bundle.failed) console.warn(`warning: ${f.label} failed: ${f.error}`);
  for (const n of bundle.notes) console.warn(`note: ${n}`);
  console.log(`Wrote ${args.out}/data.json and bundle.json: ${bundle.articles.length} articles, ${data.data_sources.length} data sources`);
}
