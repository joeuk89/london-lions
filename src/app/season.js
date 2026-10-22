import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml as esc } from '../programme/prose.js';
import { loadConfig, ROOT } from '../sync/config.js';

const format = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...options });
const shortDate = format({ weekday: 'short', day: 'numeric', month: 'short' });
const longDate = format({ weekday: 'long', day: 'numeric', month: 'long' });
const clock = format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' });

export const ukDate = (when) => isoDate.format(new Date(when));

// The service worker reads the UK date out of this path to tell today's programme from past ones.
export const programmePath = (fixture) => `programmes/${ukDate(fixture.tipoff)}-${fixture.opponent}/`;

const isPast = (f, today) => f.played || ukDate(f.tipoff) < today;
const withdrawn = (f) => f.status === 'withdrawn';

function side(f) {
  if (f.home && f.away) return { mark: 'N', title: 'Neutral venue' };
  return f.home ? { mark: 'H', title: 'Home' } : { mark: 'A', title: 'Away' };
}

const versus = (f) => `${f.designated_home ? 'v' : 'at'} ${esc(f.opponent_name)}`;

function outcome(f) {
  if (withdrawn(f)) return '<span class="chip cancelled">Cancelled</span>';
  if (!f.result) return '<span class="muted">Score to come</span>';
  const won = f.result.lions > f.result.opponent;
  return `<b class="${won ? 'w' : 'l'}">${won ? 'W' : 'L'} ${f.result.lions}–${f.result.opponent}</b>`;
}

function upcoming(f) {
  if (withdrawn(f)) return '<span class="chip cancelled">Cancelled</span>';
  return `<span>${clock.format(new Date(f.tipoff))}</span>`;
}

function row(f, badges, programmes, right) {
  const s = side(f);
  const href = programmes.has(programmePath(f)) ? programmePath(f) : null;
  const flag = f.venue_change && !withdrawn(f) ? ` <span class="chip venue">Venue change: ${esc(f.venue.name)}</span>` : '';
  const inner = `<span class="when"><time datetime="${esc(f.tipoff)}">${shortDate.format(new Date(f.tipoff))}</time></span>`
    + `<span class="what"><span class="badge">${esc(badges.get(f.competition))}</span> <abbr class="side" title="${s.title}">${s.mark}</abbr> ${versus(f)}${flag}</span>`
    + `<span class="result">${right}</span>`;
  return href
    ? `<li><a class="fixture" href="${href}" data-programme>${inner}<span class="saved" hidden>Saved</span></a></li>`
    : `<li><div class="fixture">${inner}</div></li>`;
}

function nextCard(f, badges, programmes) {
  const tipoff = new Date(f.tipoff);
  const href = programmes.has(programmePath(f)) ? programmePath(f) : null;
  const s = side(f);
  const flag = f.venue_change ? `<p class="chip venue">Venue change: ${esc(f.venue.name)}</p>` : '';
  const action = href
    ? `<a class="read" href="${href}" data-programme>Read the programme<span class="saved" hidden> · Saved</span></a>`
    : '<p class="muted">Programme arrives on game morning.</p>';
  return `<section class="next" aria-labelledby="next-title">
<h2 id="next-title">Next</h2>
<p class="meta"><span class="badge">${esc(badges.get(f.competition))}</span> <abbr class="side" title="${s.title}">${s.mark}</abbr> ${esc(longDate.format(tipoff))}</p>
<p class="opponent">${versus(f)}</p>
<p class="where"><strong>${clock.format(tipoff)}</strong> ${esc(f.venue?.name ?? 'Venue to be confirmed')}</p>
${flag}${action}
</section>`;
}

function list(id, title, fixtures, render) {
  if (fixtures.length === 0) return '';
  return `<section aria-labelledby="${id}"><h2 id="${id}">${title}</h2><ul class="fixtures">${fixtures.map(render).join('')}</ul></section>`;
}

export function renderSeasonIndex({ fixtures, competitions, programmes = new Set(), now = new Date() }) {
  const today = ukDate(now);
  const badges = new Map(competitions.map((c) => [c.id, c.badge ?? c.name]));
  const byTipoff = [...fixtures].sort((a, b) => a.tipoff.localeCompare(b.tipoff));
  const past = byTipoff.filter((f) => isPast(f, today)).reverse();
  const ahead = byTipoff.filter((f) => !isPast(f, today));
  const next = ahead.find((f) => !withdrawn(f));
  const later = ahead.filter((f) => f !== next);
  const latest = byTipoff.map(programmePath).filter((p) => programmes.has(p)).at(-1);
  const season = competitions[0]?.id.match(/(\d{4})-(\d{2})$/);
  const title = season ? `London Lions ${season[1]}–${season[2]}` : 'London Lions';

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Lions">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icons/icon-192.png">
<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="stylesheet" href="assets/programme.css">
<link rel="stylesheet" href="assets/app.css">
<script src="assets/app.js" defer></script>
</head>
<body class="season"${latest ? ` data-latest="${latest}"` : ''}>
<header class="masthead">
<h1>${title}</h1>
<p>Fixtures and matchday programmes</p>
</header>
<p class="install-banner" hidden>Add this to your home screen to keep programmes offline. <a href="install/">How to install</a></p>
<main class="season-body">
${next ? nextCard(next, badges, programmes) : ''}
${list('results-title', 'Results', past, (f) => row(f, badges, programmes, outcome(f)))}
${list('later-title', 'Later', later, (f) => row(f, badges, programmes, upcoming(f)))}
</main>
</body>
</html>
`;
}

async function existingProgrammes(root) {
  try {
    const entries = await readdir(path.join(root, 'programmes'), { withFileTypes: true });
    return new Set(entries.filter((e) => e.isDirectory()).map((e) => `programmes/${e.name}/`));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

export async function writeSeasonIndex({ fixtures, competitions, root = ROOT, now = new Date() }) {
  const programmes = await existingProgrammes(root);
  await writeFile(path.join(root, 'index.html'), renderSeasonIndex({ fixtures, competitions, programmes, now }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = JSON.parse(await readFile(path.join(ROOT, 'data/fixtures.json'), 'utf8'));
  const { competitions } = await loadConfig();
  await writeSeasonIndex({ fixtures: state.fixtures, competitions });
  console.log('Wrote index.html');
}
