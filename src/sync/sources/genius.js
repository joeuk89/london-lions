import { load } from 'cheerio';
import { UK, zonedToUtc } from '../time.js';

const BASE = 'https://hosted.dcd.shared.geniussports.com/SLB/en';
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

export function scheduleUrl({ competition_id, team_id }) {
  return `${BASE}/competition/${competition_id}/team/${team_id}/schedule`;
}

// "Oct 24, 2026, 6:00 PM", UK local: Genius prints no zone and every SLB venue is in the UK.
export function parseTipoff(text) {
  const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)/.exec(text);
  if (!m) return null;
  let hour = Number(m[4]) % 12;
  if (m[6] === 'PM') hour += 12;
  return zonedToUtc(UK, { year: Number(m[3]), month: MONTHS[m[1]], day: Number(m[2]), hour, minute: Number(m[5]) });
}

function idFromHref(href, segment) {
  const m = new RegExp(`/${segment}/(\\d+)`).exec(href ?? '');
  return m ? m[1] : null;
}

function readStatus($, row) {
  const span = row.find('.notlive .matchStatus').first();
  const text = span.text().replace(/\s+/g, ' ').trim();
  if (span.hasClass('complete') || /^final$/i.test(text)) return { status: 'played', text };
  if (span.hasClass('upcoming')) return { status: 'scheduled', text };
  if (/cancel|postpone|abandon|suspend/i.test(text)) return { status: 'withdrawn', text };
  return { status: 'unknown', text };
}

function readScore(row, side) {
  const n = Number(row.find(`.${side} .fake-cell`).first().text().trim());
  return Number.isFinite(n) && row.find(`.${side} .fake-cell`).first().text().trim() !== '' ? n : null;
}

export function parseSchedule(html, { competition_id, team_id }) {
  const $ = load(html);
  const fixtures = [];
  $('.match-wrap').each((_, el) => {
    const row = $(el);
    const id = /extfix_(\d+)/.exec(row.attr('id') ?? '')?.[1];
    if (!id) return;
    const homeLink = row.find('.home-team a[title]').first();
    const awayLink = row.find('.away-team a[title]').first();
    const home = { name: homeLink.attr('title') ?? row.find('.home-team .teamnames').text().trim(), teamId: idFromHref(homeLink.attr('href'), 'team') };
    const away = { name: awayLink.attr('title') ?? row.find('.away-team .teamnames').text().trim(), teamId: idFromHref(awayLink.attr('href'), 'team') };
    const lionsHome = home.teamId === team_id;
    const opponent = lionsHome ? away : home;
    const venueLink = row.find('a.venuename').first();
    const venueId = idFromHref(venueLink.attr('href'), 'venue');
    const { status, text: statusText } = readStatus($, row);
    const homeScore = readScore(row, 'homescore');
    const awayScore = readScore(row, 'awayscore');
    fixtures.push({
      source_id: `genius:${id}`,
      tipoff: parseTipoff(row.find('.match-time span').first().text()),
      designated_home: lionsHome,
      opponent: { name: opponent.name, genius_team_id: opponent.teamId },
      venue: venueId ? { key: `genius:${venueId}`, name: venueLink.text().trim() } : null,
      status,
      status_text: statusText,
      result: status === 'played' && homeScore !== null && awayScore !== null
        ? { lions: lionsHome ? homeScore : awayScore, opponent: lionsHome ? awayScore : homeScore }
        : null,
      url: `${BASE}/competition/${competition_id}/match/${id}/${status === 'played' ? 'boxscore' : 'preview'}`,
    });
  });
  return fixtures;
}
