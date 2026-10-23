import * as euroleague from '../sync/sources/euroleague.js';
import * as genius from '../sync/sources/genius.js';
import * as league from './league.js';

// Reads one side's previous season from each competition's hand-kept `previous` block:
// final standings, and the last game in every competition the side entered.
export async function lastSeason({ competitions, side, get, cite, canonical }) {
  const entries = [];
  const phaseCache = new Map();

  // Genius team pages carry no round, so the round comes from the knockout phase page listing the game.
  async function phaseOf(competitionId, competitionName, gameId) {
    if (!phaseCache.has(competitionId)) {
      const final = league.parseGeniusCompetitionSchedule(await get(league.geniusPhaseUrl(competitionId, 'Final')));
      phaseCache.set(competitionId, { Final: final.games, order: ['Final', ...final.phases.filter((p) => p !== 'Final').reverse()] });
    }
    const phases = phaseCache.get(competitionId);
    for (const phase of phases.order) {
      phases[phase] ??= league.parseGeniusCompetitionSchedule(await get(league.geniusPhaseUrl(competitionId, phase))).games;
      if (phases[phase].some((g) => g.id === gameId)) {
        cite(`gs-${competitionId}-phase-${phase.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, {
          publisher: league.GENIUS_PUBLISHER, title: `${competitionName} ${phase} schedule, last season`, url: league.geniusPhaseUrl(competitionId, phase),
        });
        return phase;
      }
    }
    return null;
  }

  async function geniusLeague(c, teamId) {
    const id = c.previous.competition_id;
    const urls = league.geniusUrls(id, teamId);
    const row = league.parseGeniusStandings(await get(urls.standings)).find((r) => r.team_id === teamId);
    if (!row) return null;
    cite(`gs-${id}-standings`, { publisher: league.GENIUS_PUBLISHER, title: `${c.name} final standings, last season`, url: urls.standings });
    const standing = { position: row.position, won: row.won, lost: row.lost };
    const last = league.parseGeniusLastFive(league.assertGeniusPage(await get(urls.summary), urls.summary))[0];
    if (!last) return { league: true, standing, last_game: null };
    cite(`gs-${id}-${teamId}-summary`, { publisher: league.GENIUS_PUBLISHER, title: `${side.name} ${c.name} summary, last season`, url: urls.summary });
    return {
      league: true,
      standing,
      last_game: {
        round: null, final: false, date: last.date,
        opponent_name: canonical({ name: last.opponent_name }), home: last.home, venue_name: null, for: last.for, against: last.against,
      },
    };
  }

  async function geniusCup(c, teamId) {
    const id = c.previous.competition_id;
    const url = genius.scheduleUrl({ competition_id: id, team_id: teamId });
    const played = genius.parseSchedule(league.assertGeniusPage(await get(url), url), { competition_id: id, team_id: teamId })
      .filter((r) => r.result && r.tipoff)
      .sort((a, b) => b.tipoff - a.tipoff);
    if (played.length === 0) return null;
    const last = played[0];
    const round = await phaseOf(id, c.name, last.source_id.replace('genius:', ''));
    cite(`gs-${id}-${teamId}-schedule`, { publisher: league.GENIUS_PUBLISHER, title: `${side.name} ${c.name} results, last season`, url });
    return {
      standing: null,
      last_game: {
        round, final: round === 'Final', date: last.tipoff.toISOString(),
        opponent_name: canonical({ name: last.opponent.name, genius_team_id: last.opponent.genius_team_id }),
        home: last.designated_home, venue_name: last.venue?.name ?? null, for: last.result.lions, against: last.result.opponent,
      },
    };
  }

  // Results come from the scores: a game's `winner` field names the competition's winner, not the game's.
  async function euroleagueSeason(c, code) {
    const source = { ...c.source, season: c.previous.season };
    const url = euroleague.gamesUrl(source);
    const json = JSON.parse(await get(url));
    const raw = new Map(json.data.map((g) => [`euroleague:${g.identifier}`, g]));
    const played = euroleague.parseGames(json, { club_code: code }).filter((g) => g.result).sort((a, b) => b.tipoff - a.tipoff);
    if (played.length === 0) return null;
    cite(`el-${source.season.toLowerCase()}-games`, { publisher: league.EUROLEAGUE_PUBLISHER, title: `${c.name} games, last season`, url });

    const groupRound = Math.max(...json.data.filter((g) => g.phaseType?.isGroupPhase).map((g) => g.round));
    const standingsUrl = league.euroleagueUrls(source).standings(groupRound);
    const row = league.parseEuroleagueStandings(JSON.parse(await get(standingsUrl))).find((r) => r.code === code);
    if (row) cite(`el-${source.season.toLowerCase()}-standings`, { publisher: league.EUROLEAGUE_PUBLISHER, title: `${c.name} final group standings, last season`, url: standingsUrl });

    const last = played[0];
    const phase = raw.get(last.source_id).phaseType;
    return {
      standing: row ? { group: row.group, position: row.position, won: row.won, lost: row.lost } : null,
      last_game: {
        round: phase.isGroupPhase ? `${phase.name}, round ${raw.get(last.source_id).round}` : phase.name,
        final: phase.code === 'Final',
        date: last.tipoff.toISOString(),
        opponent_name: canonical({ name: last.opponent.name, euroleague_code: last.opponent.euroleague_code }),
        home: last.designated_home, venue_name: last.venue?.name ?? null, for: last.result.lions, against: last.result.opponent,
      },
    };
  }

  for (const c of competitions.filter((x) => x.previous)) {
    let entry = null;
    if (c.previous.kind === 'genius' && side.genius_team_id) {
      entry = await (c.previous.league ? geniusLeague(c, side.genius_team_id) : geniusCup(c, side.genius_team_id));
    }
    if (c.previous.kind === 'euroleague' && side.euroleague_code) entry = await euroleagueSeason(c, side.euroleague_code);
    if (entry) entries.push({ competition: c.id, competition_name: c.name, league: false, ...entry });
  }
  const ended = entries.map((e) => e.last_game?.date).filter(Boolean).sort().at(-1) ?? null;
  return { competitions: entries, ended };
}

// Players on last season's league roster and this season's, matched by Genius person id.
export async function rosterChanges({ competitions, teamId, get, cite }) {
  const c = competitions.find((x) => x.previous?.kind === 'genius' && x.previous.league);
  const before = league.geniusUrls(c.previous.competition_id, teamId).roster;
  const now = league.geniusUrls(c.source.competition_id, teamId).roster;
  const [previous, current] = await Promise.all([before, now].map(async (url) => league.parseGeniusRoster(await get(url))));
  cite('gs-roster-last-season', { publisher: league.GENIUS_PUBLISHER, title: 'Lions roster, last season', url: before });
  const ids = (list) => new Set(list.map((p) => p.id));
  const [was, is] = [ids(previous), ids(current)];
  return {
    joined: current.filter((p) => !was.has(p.id)).map((p) => p.name),
    left: previous.filter((p) => !is.has(p.id)).map((p) => p.name),
  };
}
