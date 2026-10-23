import { load } from 'cheerio';

const GENIUS = 'https://hosted.dcd.shared.geniussports.com/SLB/en';
const EUROLEAGUE = 'https://api-live.euroleague.net';
export const GENIUS_PUBLISHER = 'Genius Sports (SLB)';
export const EUROLEAGUE_PUBLISHER = 'EuroLeague';

export const geniusUrls = (competitionId, teamId) => ({
  standings: `${GENIUS}/competition/${competitionId}/standings`,
  summary: `${GENIUS}/competition/${competitionId}/team/${teamId}`,
  roster: `${GENIUS}/competition/${competitionId}/team/${teamId}/roster`,
  statistics: `${GENIUS}/competition/${competitionId}/team/${teamId}/statistics`,
});

export const euroleagueUrls = ({ competition, season }, clubCode) => ({
  people: `${EUROLEAGUE}/v2/competitions/${competition}/seasons/${season}/clubs/${clubCode}/people`,
  statistics: `${EUROLEAGUE}/v3/competitions/${competition}/statistics/players/traditional?seasonMode=Single&seasonCode=${season}&statisticMode=PerGame&limit=1000`,
  standings: (round) => `${EUROLEAGUE}/v3/competitions/${competition}/seasons/${season}/rounds/${round}/basicstandings`,
});

const text = (el) => el.text().replace(/\s+/g, ' ').trim();
const number = (s) => (s === '' || s == null ? null : Number(s));
const personId = (href) => /\/person\/(\d+)/.exec(href ?? '')?.[1] ?? null;
const teamId = (href) => /\/team\/(\d+)/.exec(href ?? '')?.[1] ?? null;

export function parseGeniusRoster(html) {
  const $ = load(html);
  return $('table.roster-table tbody tr').map((_, el) => {
    const cells = $(el).find('td');
    const link = cells.eq(1).find('a').last();
    return {
      id: personId(link.attr('href')),
      number: number(text(cells.eq(0))),
      name: text(link) || text(cells.eq(1)),
      position: text(cells.eq(2)),
    };
  }).get().filter((p) => p.name);
}

// The statistics page has a totals table and a per-game table; only the per-game one has a PPG column.
export function parseGeniusStatistics(html) {
  const $ = load(html);
  const table = $('table.team-stats').filter((_, t) => $(t).find('thead th').map((__, th) => text($(th))).get().includes('PPG')).first();
  if (table.length === 0) throw new Error('Genius statistics page has no per-game table');
  const columns = table.find('thead th').map((_, th) => text($(th))).get();
  const at = (cells, name) => number(text(cells.eq(columns.indexOf(name))));
  return table.find('tbody tr').map((_, el) => {
    const cells = $(el).find('td');
    return {
      id: personId(cells.eq(0).find('a').attr('href')),
      games: at(cells, 'G'),
      min: at(cells, 'MPG'),
      pts: at(cells, 'PPG'),
      reb: at(cells, 'RPG'),
      ast: at(cells, 'APG'),
      stl: at(cells, 'STPG'),
      tpm: at(cells, '3PMPG'),
      tpa: at(cells, '3PAPG'),
    };
  }).get().filter((p) => p.id);
}

export function parseGeniusStandings(html) {
  const $ = load(html);
  return $('table.standings tbody tr').map((_, el) => {
    const row = $(el);
    const link = row.find('.team-name a');
    return {
      position: number(text(row.find('td').first())),
      team_id: teamId(link.attr('href')),
      team: text(row.find('.team-name-full')),
      played: number(text(row.find('.STANDINGS_played'))),
      won: number(text(row.find('.STANDINGS_won'))),
      lost: number(text(row.find('.STANDINGS_lost'))),
      points: number(text(row.find('.STANDINGS_standingPoints'))),
    };
  }).get().filter((r) => r.team);
}

// Summary rows read "10/18/26 | Liverpool Basketball (H) | W 90-89", the team's own score first.
export function parseGeniusLastFive(html) {
  const $ = load(html);
  return $('#BLOCK_TEAM_HOME_LAST5 tbody tr').map((_, el) => {
    const row = $(el);
    const date = /(\d{1,2})\/(\d{1,2})\/(\d{2})/.exec(text(row.find('.matchTime')));
    const opponent = /^(.*)\s+\((H|A)\)$/.exec(text(row.find('.matchOpponent')));
    const score = /(\d+)\s*-\s*(\d+)/.exec(text(row.find('.matchResult')));
    if (!date || !opponent || !score) return null;
    return {
      date: `20${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`,
      opponent_name: opponent[1],
      home: opponent[2] === 'H',
      for: Number(score[1]),
      against: Number(score[2]),
    };
  }).get().filter(Boolean);
}

const titleCase = (s) => s.toLowerCase()
  .replace(/(^|[\s'’-])\p{L}/gu, (c) => c.toUpperCase())
  .replace(/\b(Ii|Iii|Iv)\b/g, (n) => n.toUpperCase());

// EuroLeague names are "SURNAME, FIRST" in capitals.
export function euroleagueName(raw) {
  const [surname, first] = raw.split(/,\s*/);
  return titleCase(first ? `${first} ${surname}` : surname);
}

const POSITIONS = { Guard: 'G', Forward: 'F', Center: 'C' };

export function parseEuroleaguePeople(json) {
  const people = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(people)) throw new Error('EuroLeague people response is not a list');
  return people
    .filter((p) => p.type === 'J' && p.active)
    .map((p) => ({
      id: p.person.code,
      number: number(p.dorsal),
      name: euroleagueName(p.person.name),
      position: POSITIONS[p.positionName] ?? p.positionName ?? '',
    }))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
}

export function parseEuroleagueStatistics(json, clubCode) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(data?.players)) throw new Error('EuroLeague statistics response has no players');
  return data.players
    .filter((p) => p.player.team.code === clubCode)
    .map((p) => ({
      id: p.player.code,
      games: p.gamesPlayed,
      min: p.minutesPlayed,
      pts: p.pointsScored,
      reb: p.totalRebounds,
      ast: p.assists,
      stl: p.steals,
      tpm: p.threePointersMade,
      tpa: p.threePointersAttempted,
    }));
}

export function parseEuroleagueStandings(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(data?.teams)) throw new Error('EuroLeague standings response has no teams');
  return data.teams.map((t) => ({
    position: t.position,
    code: t.club.code,
    team: t.club.name,
    group: t.groupName,
    played: t.gamesPlayed,
    won: t.gamesWon,
    lost: t.gamesLost,
  }));
}

const round1 = (n) => Math.round(n * 10) / 10;

export function seasonAverages(stats) {
  const s = {};
  if (stats?.pts != null) s.pts = round1(stats.pts);
  if (stats?.reb != null) s.reb = round1(stats.reb);
  if (stats?.ast != null) s.ast = round1(stats.ast);
  if (stats?.min != null) s.min = Math.round(stats.min);
  return s;
}

export function joinRoster(roster, stats) {
  const byId = new Map(stats.map((s) => [s.id, s]));
  return roster.map(({ id, ...player }) => {
    const season = seasonAverages(byId.get(id));
    return Object.keys(season).length > 0 ? { ...player, season } : player;
  });
}

// Leaders are players who appeared in at least half the team's games; ties at one decimal share the line.
export function leaders(roster, stats) {
  const names = new Map(roster.map((p) => [p.id, p.name]));
  const mostGames = Math.max(0, ...stats.map((s) => s.games ?? 0));
  const qualified = stats.filter((s) => names.has(s.id) && (s.games ?? 0) >= Math.ceil(mostGames / 2));
  const top = (value) => {
    const best = Math.max(...qualified.map((s) => round1(value(s) ?? 0)));
    if (!Number.isFinite(best) || best <= 0) return [];
    return qualified.filter((s) => round1(value(s) ?? 0) === best).slice(0, 2);
  };
  const line = (key) => top((s) => s[key]).map((s) => ({ name: names.get(s.id), value: round1(s[key]) }));
  return {
    points: line('pts'),
    rebounds: line('reb'),
    assists: line('ast'),
    steals: line('stl'),
    threes: top((s) => s.tpm).map((s) => ({ name: names.get(s.id), made: round1(s.tpm), attempted: round1(s.tpa ?? 0) })),
  };
}

export const geniusPhaseUrl = (competitionId, phase) => `${GENIUS}/competition/${competitionId}/schedule?phaseName=${encodeURIComponent(phase)}`;

// The competition-wide schedule has no title attribute on team links, so the sync's
// team-page parser (src/sync/sources/genius.js) reads both sides as the opponent here.
export function parseGeniusCompetitionSchedule(html) {
  const $ = load(html);
  const side = (row, which) => {
    const link = row.find(`.${which}-team a.teamnames`).first();
    const score = text(row.find(`.${which}score .fake-cell`).first());
    return { team_id: teamId(link.attr('href')), name: text(link.find('.team-name-full')) || text(link), score: number(score) };
  };
  const games = $('.match-wrap').map((_, el) => {
    const row = $(el);
    const id = /extfix_(\d+)/.exec(row.attr('id') ?? '')?.[1];
    if (!id) return null;
    return { id, home: side(row, 'home'), away: side(row, 'away'), venue_name: text(row.find('a.venuename').first()) };
  }).get().filter(Boolean);
  const phases = [...new Set($('a[href*="phaseName="]').map((_, a) => new URL($(a).attr('href'), GENIUS).searchParams.get('phaseName')).get())];
  return { games, phases };
}

// Genius serves a bare "Error" page, with a 200, for some team pages.
export function assertGeniusPage(html, url) {
  if (/<title>\s*Error\s*<\/title>/i.test(html)) throw new Error(`${url} returned the Genius error page`);
  return html;
}
