const BASE = 'https://api-live.euroleague.net/v2';

export function gamesUrl({ competition, season }) {
  return `${BASE}/competitions/${competition}/seasons/${season}/games`;
}

function statusOf(game) {
  if (game.played) return { status: 'played', text: game.gameStatus };
  if (game.gameStatus === 'Confirmed') return { status: 'scheduled', text: game.gameStatus };
  if (/cancel|postpone|abandon|suspend/i.test(game.gameStatus ?? '')) return { status: 'withdrawn', text: game.gameStatus };
  return { status: 'unknown', text: String(game.gameStatus) };
}

function titleCase(name) {
  return name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
}

export function parseGames(json, { club_code }) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(data?.data)) throw new Error('EuroLeague response has no data array');
  return data.data
    .filter((g) => g.local?.club?.code === club_code || g.road?.club?.code === club_code)
    .map((g) => {
      const lionsHome = g.local.club.code === club_code;
      const opponent = lionsHome ? g.road.club : g.local.club;
      const { status, text } = statusOf(g);
      const score = (side) => (Number.isFinite(side?.score) ? side.score : null);
      return {
        source_id: `euroleague:${g.identifier}`,
        tipoff: g.utcDate ? new Date(g.utcDate) : null,
        designated_home: lionsHome,
        opponent: { name: opponent.name, euroleague_code: opponent.code },
        venue: g.venue?.code
          ? { key: `euroleague:${g.venue.code}`, name: titleCase(g.venue.name ?? ''), address: g.venue.address || null }
          : null,
        status,
        status_text: text,
        result: status === 'played' && score(g.local) !== null && score(g.road) !== null
          ? { lions: lionsHome ? g.local.score : g.road.score, opponent: lionsHome ? g.road.score : g.local.score }
          : null,
        url: `https://www.euroleaguebasketball.net/eurocup/game-center/${g.season?.code?.replace(/^U/, '') ?? ''}/${g.gameCode}/`,
        neutral: Boolean(g.isNeutralVenue),
      };
    });
}
