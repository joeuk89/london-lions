import { citedSources, escapeHtml as esc, normaliseHeading, parseProse } from './prose.js';

const LIONS = 'London Lions';

const format = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...options });
const weekday = format({ weekday: 'long' });
const dayMonthYear = format({ day: 'numeric', month: 'long', year: 'numeric' });
const longDate = { format: (when) => `${weekday.format(when)} ${dayMonthYear.format(when)}` };
const shortDate = format({ weekday: 'short', day: 'numeric', month: 'short' });
const fullDate = format({ day: 'numeric', month: 'short', year: 'numeric' });
const clock = format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const at = (when) => new Date(when);

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv']);
export function surname(name) {
  const words = name.trim().split(/\s+/);
  while (words.length > 1 && SUFFIXES.has(words.at(-1).toLowerCase())) words.pop();
  return words.at(-1);
}

const score = (r) => `${r.for > r.against ? 'W' : 'L'} ${r.for}–${r.against}`;
const versus = (r) => `${r.home ? 'v' : 'at'} ${esc(r.opponent_name)}`;
const one = (n) => Number(n).toFixed(1);

function seasonLine(player) {
  const s = player.season ?? {};
  const parts = [
    s.pts != null && `${one(s.pts)} pts`,
    s.reb != null && `${one(s.reb)} reb`,
    s.ast != null && `${one(s.ast)} ast`,
    s.min != null && `${Math.round(s.min)} min`,
  ].filter(Boolean);
  if (parts.length === 0) throw new Error(`Player card ${player.name} has no season averages`);
  return `Season: ${parts.join(', ')}`;
}

const mapsUrl = (venue) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue.name}, ${venue.address}`)}`;

function results(list) {
  return `<ul class="scores">${list.map((r) => `<li><span><time datetime="${esc(r.date)}">${shortDate.format(at(r.date))}</time> <em class="muted">${esc(r.competition_name)}</em> ${versus(r)}</span><span>${score(r)}</span></li>`).join('')}</ul>`;
}

function highlights(list = []) {
  if (list.length === 0) return '';
  return `<h3>Highlights</h3><ul class="links">${list.map((v) => `<li><a href="${esc(v.url)}">${esc(v.title)}</a> <span class="muted">${shortDate.format(at(v.published))}</span></li>`).join('')}</ul>`;
}

function roster(list) {
  return `<h3>Full roster</h3><table class="roster"><tbody>${list.map((p) => `<tr><td class="n">${esc(p.number)}</td><td>${esc(p.name)}</td><td>${esc(p.position)}</td></tr>`).join('')}</tbody></table>`;
}

function headToHead(data) {
  const h2h = data.head_to_head;
  if (!h2h) return '';
  const out = [];
  if (h2h.scope === 'last-season') out.push('<p class="muted">No meetings yet this season. Last season:</p>');
  if (h2h.meetings.length > 0) {
    out.push(`<ul class="scores">${h2h.meetings.map((m) => `<li><span><time datetime="${esc(m.date)}">${fullDate.format(at(m.date))}</time> <em class="muted">${esc(m.competition_name)}</em> ${m.home ? '' : 'at '}${esc(m.venue_name)}</span><span>${score({ for: m.lions, against: m.opponent })}</span></li>`).join('')}</ul>`);
  } else {
    out.push('<p class="muted">No previous meetings on record.</p>');
  }
  if (h2h.overall) {
    out.push(`<p class="muted">All meetings: Lions ${h2h.overall.lions} wins, ${esc(data.opponent.name)} ${h2h.overall.opponent}.</p>`);
  }
  return out.join('');
}

function leagueTable(data) {
  const table = data.table;
  if (!table) return '';
  const ours = new Set([LIONS, data.opponent.name]);
  return `<table><thead><tr><th class="n">#</th><th>Team</th><th class="n">P</th><th class="n">W</th><th class="n">L</th><th class="n">Pts</th></tr></thead><tbody>${table.rows.map((r, i) => `<tr${ours.has(r.team) ? ' class="us"' : ''}><td class="n">${i + 1}</td><td>${esc(r.team)}</td><td class="n">${r.played}</td><td class="n">${r.won}</td><td class="n">${r.lost}</td><td class="n">${r.points}</td></tr>`).join('')}</tbody></table>`;
}

function next(list) {
  return `<ul class="scores">${list.map((f) => `<li><span><time datetime="${esc(f.tipoff)}">${shortDate.format(at(f.tipoff))}, ${clock.format(at(f.tipoff))}</time> <em class="muted">${esc(f.competition_name)}</em> ${versus(f)}${f.venue_change ? ` (at ${esc(f.venue_name)})` : ''}</span></li>`).join('')}</ul>`;
}

const has = (list) => Array.isArray(list) && list.length > 0;

const SECTIONS = [
  {
    heading: 'Form',
    mandatory: true,
    data: (d) => has(d.lions.results) && results(d.lions.results) + highlights(d.lions.highlights),
  },
  {
    heading: 'Lions roster',
    mandatory: true,
    team: (d) => d.lions,
    data: (d) => has(d.lions.roster) && roster(d.lions.roster),
  },
  { heading: 'Injury and availability' },
  {
    heading: 'The opposition',
    title: (d) => esc(d.opponent.name),
    mandatory: true,
    team: (d) => d.opponent,
    data: (d) => has(d.opponent.results) && has(d.opponent.roster)
      && `<h3>Last five</h3>${results(d.opponent.results.slice(0, 5))}${highlights(d.opponent.highlights)}${roster(d.opponent.roster)}`,
  },
  { heading: 'Things to watch' },
  { heading: 'Head to head', mandatory: true, dataFirst: true, data: headToHead },
  { heading: 'League table', data: leagueTable },
  { heading: 'Notable stats' },
  { heading: 'Club news' },
  { heading: "What's next", mandatory: true, data: (d) => has(d.next) && next(d.next) },
];

const sectionIndex = (heading) => SECTIONS.findIndex((s) => s.heading.toLowerCase() === normaliseHeading(heading).toLowerCase());

function blocksHtml(blocks, team) {
  const out = [];
  let cards = [];
  const flushCards = () => {
    if (cards.length > 0) out.push(`<div class="cards">${cards.join('')}</div>`);
    cards = [];
  };
  for (const block of blocks) {
    if (block.type === 'card') {
      const player = team?.roster.find((p) => p.name.toLowerCase() === block.name.toLowerCase());
      if (!player) throw new Error(`Player card ${block.name} is not on the ${team ? `${team.name} ` : ''}roster`);
      cards.push(`<div><h3>${esc(player.name)}</h3><small class="season">${seasonLine(player)}</small>${block.paragraphs.map((p) => `<p>${p.html}</p>`).join('')}</div>`);
      continue;
    }
    flushCards();
    if (block.type === 'p') out.push(`<p>${block.html}</p>`);
    if (block.type === 'list') out.push(`<ul class="points">${block.items.map((item) => `<li>${item.html}</li>`).join('')}</ul>`);
  }
  flushCards();
  return out.join('');
}

function sectionsHtml(data, prose, warnings) {
  const written = new Map();
  let last = -1;
  for (const section of prose.sections) {
    const index = sectionIndex(section.heading);
    if (index === -1) throw new Error(`Unknown programme section "${section.heading}"`);
    if (written.has(index)) throw new Error(`Section "${section.heading}" appears twice`);
    if (index < last) throw new Error(`Section "${section.heading}" is out of order`);
    written.set(index, section);
    last = index;
  }

  const omitted = new Map((prose.meta.omitted ?? []).map((o) => [sectionIndex(o.section), o]));
  for (const [index, o] of omitted) {
    if (index === -1) throw new Error(`Front-matter omits unknown section "${o.section}"`);
    if (SECTIONS[index].mandatory) throw new Error(`Mandatory section "${o.section}" cannot be omitted`);
    if (written.has(index)) throw new Error(`Section "${o.section}" is both written and omitted`);
  }

  return SECTIONS.map((def, index) => {
    const prosed = written.get(index);
    const team = def.team?.(data);
    const dataHtml = def.data?.(data) || '';
    if (def.mandatory && !dataHtml) throw new Error(`Mandatory section "${def.heading}" has no data`);
    const proseHtml = prosed ? blocksHtml(prosed.blocks, team) : '';
    if (!dataHtml && !proseHtml) {
      if (prosed) throw new Error(`Section "${def.heading}" has a heading but nothing in it`);
      if (!def.data && !omitted.has(index)) warnings.push(`Section "${def.heading}" is missing and not listed as omitted`);
      return '';
    }
    const title = def.title?.(data) ?? esc(def.heading);
    const subtitle = prosed?.subtitle ? ` <i>${prosed.subtitle}</i>` : '';
    const body = def.dataFirst ? dataHtml + proseHtml : proseHtml + dataHtml;
    return `<section><h2>${title}${subtitle}</h2>${body}</section>`;
  }).join('');
}

function cover(data) {
  const f = data.fixture;
  const [first, second] = f.designated_home ? [LIONS, f.opponent_name] : [f.opponent_name, LIONS];
  const tipoff = at(f.tipoff);
  const address = f.venue_change
    ? `<a href="${esc(mapsUrl(f.venue))}">${esc(f.venue.address)}</a>`
    : esc(f.venue.address);
  const flag = f.venue_change
    ? `<p class="venue-flag">Venue change: this game is at ${esc(f.venue.name)}, ${address}.${f.venue.directions ? `<span>${esc(f.venue.directions)}</span>` : ''}</p>`
    : '';
  return `<header class="cover">
<p class="date">${longDate.format(tipoff)}, ${esc(f.competition_name)}</p>
<h1>${esc(first)} <i>v</i> <b>${esc(second)}</b></h1>
<p class="where"><strong>${clock.format(tipoff)}</strong>${esc(f.venue.name)}, ${address}</p>
${flag}
</header>`;
}

function formStrip(list) {
  return `<span class="form">${list.slice(0, 5).reverse().map((r) => {
    const won = r.for > r.against;
    return `<span class="${won ? 'w' : 'l'}">${won ? 'W' : 'L'}</span>`;
  }).join(' ')}</span>`;
}

const leaders = (list = []) => list.map((l) => `${esc(surname(l.name))} ${one(l.value)}`).join(', ');
const threes = (list = []) => list.map((l) => `${esc(surname(l.name))} ${one(l.made)} of ${one(l.attempted)}`).join(', ');
const record = (r) => `${r.position ? `${ordinal(r.position)}, ` : ''}${r.won}–${r.lost}`;
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
const lastGame = (r) => `${score(r)} ${versus(r)}, ${shortDate.format(at(r.date))}`;

function comparison(data) {
  const { lions, opponent } = data;
  if (!lions.record || !opponent.record || !lions.leaders || !opponent.leaders) {
    throw new Error('Comparison table needs a record and leaders for both teams');
  }
  const meeting = data.head_to_head?.meetings?.[0];
  const rows = [
    ['Record', record(lions.record), record(opponent.record)],
    ['Last five', formStrip(lions.results), formStrip(opponent.results)],
    ['Last game', lastGame(lions.results[0]), lastGame(opponent.results[0])],
    ['Top scorer', leaders(lions.leaders.points), leaders(opponent.leaders.points)],
    ['Rebounds', leaders(lions.leaders.rebounds), leaders(opponent.leaders.rebounds)],
    ['Assists', leaders(lions.leaders.assists), leaders(opponent.leaders.assists)],
    ['Threes a game', threes(lions.leaders.threes), threes(opponent.leaders.threes)],
    ['Steals', leaders(lions.leaders.steals), leaders(opponent.leaders.steals)],
    meeting && ['Last meeting', String(meeting.lions), String(meeting.opponent)],
  ].filter(Boolean);
  return `<table class="compare">
<thead><tr><th>${LIONS}</th><td></td><th class="opp">${esc(opponent.name)}</th></tr></thead>
<tbody>${rows.map(([label, l, r]) => `<tr><td>${l}</td><th scope="row">${label}</th><td class="opp">${r}</td></tr>`).join('')}</tbody>
</table>`;
}

function sourcesHtml(data, ids) {
  const groups = new Map();
  for (const id of new Set(ids)) {
    const source = data.sources[id];
    if (!source) throw new Error(`Marker [src:${id}] does not resolve to a source`);
    if (!groups.has(source.publisher)) groups.set(source.publisher, []);
    groups.get(source.publisher).push(source);
  }
  const items = [...groups].map(([publisher, list]) => `<h3>${esc(publisher)}</h3><ul>${list.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a>${s.published ? `, ${fullDate.format(at(s.published))}` : ''}</li>`).join('')}</ul>`);
  const gathered = at(data.gathered_at);
  return `<aside class="sources" aria-labelledby="sources-title"><h2 id="sources-title">Sources</h2>${items.join('')}<p class="gathered">Gathered ${fullDate.format(gathered)} at ${clock.format(gathered)}.</p></aside>`;
}

export function renderProgramme(data, markdown, { assets = 'assets' } = {}) {
  const warnings = [];
  const prose = parseProse(markdown);
  const f = data.fixture;
  const intro = prose.intro.map((block, i) => {
    if (block.type !== 'p') throw new Error('Intro may only hold paragraphs');
    return `<p${i === 0 ? ' class="lede"' : ''}>${block.html}</p>`;
  }).join('');
  const body = comparison(data) + intro + sectionsHtml(data, prose, warnings);
  const sources = sourcesHtml(data, [...(data.data_sources ?? []), ...citedSources(prose)]);
  const [first, second] = f.designated_home ? [LIONS, f.opponent_name] : [f.opponent_name, LIONS];

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(first)} v ${esc(second)}, ${longDate.format(at(f.tipoff))}</title>
<link rel="stylesheet" href="${esc(assets)}/programme.css">
</head>
<body>
${cover(data)}
<div class="layout">
<main class="body">
${body}
</main>
${sources}
</div>
</body>
</html>
`;
  return { html, meta: prose.meta, warnings };
}
