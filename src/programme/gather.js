import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ukDate } from '../app/season.js';
import { loadConfig, resolveOpponent, ROOT } from '../sync/config.js';
import { fetchText } from '../sync/fetch.js';
import * as euroleague from '../sync/sources/euroleague.js';
import * as genius from '../sync/sources/genius.js';
import * as googleNews from './google-news.js';
import * as league from './league.js';
import { EUROLEAGUE_PUBLISHER, GENIUS_PUBLISHER } from './league.js';
import * as news from './news.js';
import { lastSeason, rosterChanges } from './previous.js';

const LIONS = 'London Lions';
const LIONS_NAMES = [LIONS, 'Lions'];
const ARTICLES_PER_SOURCE = 10;
const OPENER_ARTICLES_PER_SOURCE = 40;
const WOMENS_TEAM = /London Lions Women|\bSLBW\b|\bWSLB\b|\bWNBL\b/;
const DAY = 24 * 60 * 60 * 1000;
const NO_LEADERS = { points: [], rebounds: [], assists: [], steals: [], threes: [] };
const FULL_TEXT = 300;

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
  const pages = new Map();
  const get = (url) => {
    if (!pages.has(url)) pages.set(url, fetchWithRetry(url, { fetch, pause }));
    return pages.get(url);
  };
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

  const before = state.fixtures.filter((f) => f.tipoff < fixture.tipoff && f.result).sort(byNewest);
  const lionsResults = before.slice(0, 5).map((f) => ({
    date: f.tipoff,
    competition_name: short(f.competition),
    opponent_name: f.opponent_name,
    home: f.designated_home,
    for: f.result.lions,
    against: f.result.opponent,
  }));

  const opener = !state.fixtures.some((f) => f.tipoff < fixture.tipoff && f.status !== 'withdrawn');
  const statsOf = (f) => competitions.get(f.competition)?.stats_from ?? f.competition;
  const lionsPlayed = before.some((f) => statsOf(f) === statsCompetition.id);
  const gameDay = ukDate(fixture.tipoff);
  const beforeGameDay = (r) => r.date.slice(0, 10) < gameDay;

  const teams = statsCompetition.source.kind === 'genius'
    ? await geniusTeams()
    : await euroleagueTeams();

  async function geniusTeams() {
    const source = statsCompetition.source;
    const opponentId = opponentEntry?.genius_team_id;
    if (!opponentId) throw new Error(`${fixture.opponent_name} has no genius_team_id in the opponents table`);
    const lionsUrls = league.geniusUrls(source.competition_id, source.team_id);
    const opponentUrls = league.geniusUrls(source.competition_id, opponentId);
    const [standingsHtml, lionsRoster, opponentSummary, opponentRoster] = await Promise.all([
      get(lionsUrls.standings), get(lionsUrls.roster), get(opponentUrls.summary), get(opponentUrls.roster),
    ]);
    const opponentResults = league.parseGeniusLastFive(opponentSummary).filter(beforeGameDay).map((r) => ({
      ...r, competition_name: short(statsCompetition.id), opponent_name: canonical({ name: r.opponent_name }),
    }));
    const opponentPlayed = opponentResults.length > 0;
    const standings = league.parseGeniusStandings(standingsHtml);
    const record = (teamId, played) => {
      if (!played) return { won: 0, lost: 0 };
      const row = standings.find((r) => r.team_id === teamId);
      if (!row) throw new Error(`Team ${teamId} is missing from the ${statsCompetition.name} standings`);
      return { position: row.position, won: row.won, lost: row.lost };
    };
    // Before a side's first game its statistics page has no per-game table to read.
    const team = async (rosterHtml, urls, played, statsId, statsTitle) => {
      const roster = league.parseGeniusRoster(rosterHtml);
      if (!played) return { roster: roster.map(({ id, ...player }) => player), leaders: NO_LEADERS };
      const stats = league.parseGeniusStatistics(await get(urls.statistics));
      cite(statsId, { publisher: GENIUS_PUBLISHER, title: statsTitle, url: urls.statistics });
      return { roster: league.joinRoster(roster, stats), leaders: league.leaders(roster, stats) };
    };
    cite('gs-standings', { publisher: GENIUS_PUBLISHER, title: `${statsCompetition.name} standings`, url: lionsUrls.standings });
    cite('gs-lions-roster', { publisher: GENIUS_PUBLISHER, title: 'Lions roster', url: lionsUrls.roster });
    cite('gs-opponent', { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} summary`, url: opponentUrls.summary });
    cite('gs-opponent-roster', { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} roster`, url: opponentUrls.roster });
    return {
      lions: {
        record: record(source.team_id, lionsPlayed),
        ...await team(lionsRoster, lionsUrls, lionsPlayed, 'gs-lions-stats', 'Lions player statistics'),
      },
      opponent: {
        record: record(opponentId, opponentPlayed),
        ...await team(opponentRoster, opponentUrls, opponentPlayed, 'gs-opponent-stats', `${fixture.opponent_name} player statistics`),
        results: opponentResults,
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
    const [games, lionsPeople, opponentPeople] = await Promise.all([
      getJson(gamesUrl), getJson(lionsUrls.people), getJson(opponentUrls.people),
    ]);
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
      .filter(beforeGameDay)
      .sort(byNewest);
    const opponentPlayed = results.length > 0;
    const playedRounds = games.data.filter((g) => g.played && g.utcDate.slice(0, 10) < gameDay).map((g) => g.round);
    const round = Math.max(1, ...playedRounds);
    const standings = playedRounds.length > 0 ? league.parseEuroleagueStandings(await getJson(lionsUrls.standings(round))) : [];
    const statistics = lionsPlayed || opponentPlayed ? await getJson(lionsUrls.statistics) : null;
    const record = (code, played) => {
      if (!played) return { won: 0, lost: 0 };
      const row = standings.find((r) => r.code === code);
      if (!row) throw new Error(`Club ${code} is missing from the EuroCup standings`);
      return { position: row.position, won: row.won, lost: row.lost };
    };
    const team = (peopleJson, code, played) => {
      const roster = league.parseEuroleaguePeople(peopleJson);
      if (!played) return { roster: roster.map(({ id, ...player }) => player), leaders: NO_LEADERS };
      const stats = league.parseEuroleagueStatistics(statistics, code);
      return { roster: league.joinRoster(roster, stats), leaders: league.leaders(roster, stats) };
    };
    cite('el-games', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} games`, url: gamesUrl });
    if (standings.length > 0) cite('el-standings', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} standings after round ${round}`, url: lionsUrls.standings(round) });
    if (statistics) cite('el-stats', { publisher: EUROLEAGUE_PUBLISHER, title: `${statsCompetition.name} player statistics`, url: lionsUrls.statistics });
    cite('el-lions-roster', { publisher: EUROLEAGUE_PUBLISHER, title: 'Lions roster', url: lionsUrls.people });
    cite('el-opponent-roster', { publisher: EUROLEAGUE_PUBLISHER, title: `${fixture.opponent_name} roster`, url: opponentUrls.people });
    return {
      lions: { record: record(source.club_code, lionsPlayed), ...team(lionsPeople, source.club_code, lionsPlayed) },
      opponent: { record: record(opponentCode, opponentPlayed), ...team(opponentPeople, opponentCode, opponentPlayed), results },
      standings,
    };
  }

  for (const id of new Set(before.slice(0, 5).map((f) => f.competition))) {
    const c = competitions.get(id);
    if (c.source.kind === 'genius') {
      cite(`gs-schedule-${c.source.competition_id}`, { publisher: GENIUS_PUBLISHER, title: `Lions ${c.name} fixtures and results`, url: genius.scheduleUrl(c.source) });
    } else {
      cite('el-games', { publisher: EUROLEAGUE_PUBLISHER, title: `${c.name} games`, url: euroleague.gamesUrl(c.source) });
    }
  }

  // At the season opener every table reads 0-0, or reads today's numbers when replaying an old fixture.
  const table = opener ? null : await leagueTable();
  async function leagueTable() {
    if (competition.source.kind === 'euroleague') {
      const group = teams.standings.find((r) => r.code === competition.source.club_code)?.group;
      if (!group) return null;
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
    return { scope: 'last-season', meetings: await lastSeasonMeetings() };
  }

  // Read from the opponent's pages, since Genius serves an error page for some of the Lions' own.
  async function lastSeasonMeetings() {
    const lionsId = config.competitions.find((c) => c.source?.kind === 'genius')?.source.team_id;
    const meetings = [];
    for (const c of config.competitions.filter((x) => x.previous)) {
      const p = c.previous;
      if (p.kind === 'genius' && opponentEntry?.genius_team_id) {
        const team = { competition_id: p.competition_id, team_id: opponentEntry.genius_team_id };
        const url = genius.scheduleUrl(team);
        const rows = genius.parseSchedule(league.assertGeniusPage(await get(url), url), team)
          .filter((r) => r.result && r.tipoff && r.opponent.genius_team_id === lionsId);
        if (rows.length === 0) continue;
        cite(`gs-${p.competition_id}-${team.team_id}-schedule`, { publisher: GENIUS_PUBLISHER, title: `${fixture.opponent_name} ${c.name} results, last season`, url });
        meetings.push(...rows.map((r) => ({
          date: r.tipoff.toISOString(), competition_name: short(c.id), home: !r.designated_home,
          venue_name: r.venue?.name ?? '', lions: r.result.opponent, opponent: r.result.lions,
        })));
      }
      if (p.kind === 'euroleague' && opponentEntry?.euroleague_code) {
        const previous = { ...c.source, season: p.season };
        const url = euroleague.gamesUrl(previous);
        const games = euroleague.parseGames(await get(url), previous)
          .filter((g) => g.result && g.opponent.euroleague_code === opponentEntry.euroleague_code);
        if (games.length === 0) continue;
        cite(`el-${p.season.toLowerCase()}-games`, { publisher: EUROLEAGUE_PUBLISHER, title: `${c.name} games, last season`, url });
        meetings.push(...games.map((g) => ({
          date: g.tipoff.toISOString(), competition_name: short(c.id), home: g.designated_home,
          venue_name: g.venue?.name ?? '', lions: g.result.lions, opponent: g.result.opponent,
        })));
      }
    }
    return meetings.sort(byNewest);
  }

  const next = state.fixtures
    .filter((f) => f.tipoff > fixture.tipoff && f.status !== 'withdrawn')
    .sort((a, b) => a.tipoff.localeCompare(b.tipoff))
    .slice(0, 4)
    .map((f) => ({
      tipoff: f.tipoff, competition_name: short(f.competition), opponent_name: f.opponent_name,
      home: f.designated_home, venue_name: f.venue?.name ?? 'Venue to be confirmed', venue_change: f.venue_change,
    }));

  const sourced = (kind) => config.competitions.find((c) => c.source?.kind === kind)?.source;
  const previous = (side) => lastSeason({ competitions: config.competitions, side, get, cite, canonical });
  const lionsLastSeason = opener
    ? await previous({ name: LIONS, genius_team_id: sourced('genius')?.team_id, euroleague_code: sourced('euroleague')?.club_code })
    : null;
  if (opener && (!lionsLastSeason.competitions.some((c) => c.league && c.standing) || !lionsLastSeason.ended)) {
    throw new Error('Last season has no standings or games; check the previous blocks in config/competitions.json');
  }
  const summer = opener
    ? await rosterChanges({ competitions: config.competitions, teamId: sourced('genius').team_id, get, cite })
    : null;
  const opponentLastSeason = teams.opponent.results.length === 0
    ? await previous({ name: fixture.opponent_name, genius_team_id: opponentEntry?.genius_team_id, euroleague_code: opponentEntry?.euroleague_code })
    : null;

  const dayAfter = (date) => new Date(Date.parse(date.slice(0, 10)) + DAY).toISOString();
  const windows = {
    lions_news_since: opener ? dayAfter(lionsLastSeason.ended) : news.newsWindow(now, lionsResults[0]?.date),
    opponent_news_since: opponentLastSeason?.ended
      ? dayAfter(opponentLastSeason.ended)
      : news.newsWindow(now, teams.opponent.results[0]?.date),
    highlights_since: news.highlightsWindow(now),
  };

  const articles = [];
  const counters = {};
  const nextId = (prefix) => {
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    return `${prefix}-${counters[prefix]}`;
  };

  const perSource = opener ? OPENER_ARTICLES_PER_SOURCE : ARTICLES_PER_SOURCE;
  async function readItems(feed) {
    const listing = await get(feed.url);
    if (feed.kind === 'rss') return news.parseFeed(listing);
    return news.parseListing(listing, feed);
  }

  // A paper that reports both Lions teams in one article is screened on the title only; the prompt drops the women's paragraphs.
  async function addArticles({ feed, prefix, publisher, label, keep, screenTitleOnly = false }) {
    let items;
    try {
      items = await readItems(feed);
    } catch (error) {
      failed.push({ label, url: feed.url, error: error.message });
      return;
    }
    const kept = items.map((item) => ({ item, scope: keep(item) })).filter(({ scope }) => scope);
    let added = 0;
    for (const { item, scope } of kept) {
      if (added >= perSource) break;
      let text = item.html ? news.htmlToText(item.html) : '';
      if (text.length < FULL_TEXT) {
        try {
          text = news.articleText(await get(item.url));
        } catch (error) {
          notes.push(`Could not read ${item.url}: ${error.message}`);
          continue;
        }
      }
      if (WOMENS_TEAM.test(screenTitleOnly ? item.title : `${item.title}\n${text}`)) continue;
      added += 1;
      const id = nextId(prefix);
      sources[id] = { publisher, title: item.title, url: item.url, published: item.published };
      articles.push({ id, scope, publisher, title: item.title, url: item.url, published: item.published, text });
    }
  }

  const opponentNames = [fixture.opponent_name, ...(opponentEntry?.aliases ?? [])];
  const since = (item, from) => item.published && item.published >= from && item.published <= now.toISOString();
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
  if (programme.newham_recorder) {
    await addArticles({
      feed: programme.newham_recorder, prefix: 'nr', publisher: 'Newham Recorder', label: 'Newham Recorder news',
      keep: byMention, screenTitleOnly: true,
    });
  }

  const headlines = [];
  if (programme.google_news) await addGoogleNews(programme.google_news);

  // Runs after the direct feeds, so a story they already carry keeps its direct copy.
  async function addGoogleNews(feed) {
    const earliest = Math.min(Date.parse(windows.lions_news_since), Date.parse(windows.opponent_news_since));
    const days = Math.ceil((now.getTime() - earliest) / DAY);
    const headlineKey = (title) => news.normalise(title).trim();
    const seen = new Set(articles.map((a) => headlineKey(a.title)));
    const excluded = new Set(feed.exclude_publishers ?? []);
    for (const query of feed.queries) {
      const q = query.replaceAll('{opponent}', fixture.opponent_name);
      const url = googleNews.searchUrl(q, days);
      let items;
      try {
        items = googleNews.parseSearch(await get(url));
      } catch (error) {
        failed.push({ label: `Google News: ${q}`, url, error: error.message });
        continue;
      }
      let added = 0;
      for (const item of items) {
        if (added >= perSource) break;
        const scope = byMention(item);
        const key = headlineKey(item.title);
        if (!scope || excluded.has(item.publisher) || seen.has(key) || WOMENS_TEAM.test(item.title)) continue;
        seen.add(key);
        added += 1;
        const id = nextId('gn');
        const { url: link, text } = await readThrough(item, feed);
        const entry = { publisher: item.publisher, title: item.title, url: link, published: item.published };
        sources[id] = entry;
        if (text) articles.push({ id, scope, ...entry, text });
        else headlines.push({ id, scope, ...entry });
      }
    }
  }

  // A Google item becomes an article only when its link decodes and the publisher's page reads.
  async function readThrough(item, feed) {
    if (!feed.decode_links) return { url: item.url };
    let url;
    try {
      url = await googleNews.decodeLink(item.url, fetch);
    } catch (error) {
      notes.push(`Could not decode the Google News link for "${item.title}": ${error.message}`);
      return { url: item.url };
    }
    const host = new URL(url).hostname;
    if ((feed.no_fetch_hosts ?? []).some((h) => host === h || host.endsWith(`.${h}`))) return { url };
    try {
      const text = news.articleText(await get(url));
      if (text.length >= FULL_TEXT) return { url, text };
      notes.push(`${url} has too little text to read, so it stays a headline.`);
    } catch (error) {
      notes.push(`Could not read ${url}: ${error.message}`);
    }
    return { url };
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
    season_opener: opener,
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
    ...(opener ? { last_season: lionsLastSeason, summer } : {}),
    opponent: {
      name: fixture.opponent_name,
      record: teams.opponent.record,
      leaders: teams.opponent.leaders,
      results: teams.opponent.results.slice(0, 5),
      highlights: await highlights(opponentEntry?.youtube_channel_id, 'yt-opponent', `${fixture.opponent_name} channel feed`),
      roster: teams.opponent.roster,
      ...(opponentLastSeason ? { last_season: opponentLastSeason } : {}),
    },
    head_to_head: headToHead,
    table,
    next,
    data_sources: [...dataSources],
    sources,
  };
  const bundle = { fixture_id: fixture.id, gathered_at: now.toISOString(), windows, failed, notes, articles, headlines };
  return { data, bundle };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values: args } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: path.join(ROOT, 'out/run') },
      state: { type: 'string', default: path.join(ROOT, 'data/fixtures.json') },
      now: { type: 'string' },
    },
  });
  if (!args.fixture) {
    console.error('Usage: node src/programme/gather.js --fixture <id> [--out <dir>] [--now <ISO time>]');
    process.exit(2);
  }
  const state = JSON.parse(await readFile(args.state, 'utf8'));
  const fixture = state.fixtures.find((f) => f.id === args.fixture);
  if (!fixture) throw new Error(`No stored fixture has id ${args.fixture}`);
  const config = await loadConfig();
  const programme = JSON.parse(await readFile(path.join(ROOT, 'config/programme.json'), 'utf8'));
  const now = args.now ? new Date(args.now) : new Date();
  const { data, bundle } = await gather({ fixture, state, config, programme, now });
  await mkdir(args.out, { recursive: true });
  await writeFile(path.join(args.out, 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(path.join(args.out, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  for (const f of bundle.failed) console.warn(`warning: ${f.label} failed: ${f.error}`);
  for (const n of bundle.notes) console.warn(`note: ${n}`);
  console.log(`Wrote ${args.out}/data.json and bundle.json: ${bundle.articles.length} articles, ${bundle.headlines.length} headlines, ${data.data_sources.length} data sources`);
}
