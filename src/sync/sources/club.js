import { load } from 'cheerio';

export const SCHEDULE_URL = 'https://www.thelondonlions.com/schedule';
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

function parseDate(text) {
  const m = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(text);
  return m ? `${m[3]}-${pad(MONTHS[m[1]])}-${pad(Number(m[2]))}` : null;
}

// The badge is free text ("18:00 BST", "1930 GMT", and wrong zone labels), so take the digits as UK local.
function parseTime(text) {
  const m = /(\d{1,2}):?(\d{2})/.exec(text);
  return m ? `${pad(Number(m[1]))}:${m[2]}` : null;
}

function visible(el) {
  return el.length > 0 && !el.hasClass('w-condition-invisible');
}

export function parseCards(html, { club_name = 'London Lions' } = {}) {
  const $ = load(html);
  const cards = [];
  $('.main-fixtures.w-dyn-item').each((_, el) => {
    const card = $(el);
    const league = card.find('[fs-list-field="league"]').first().text().trim();
    if (/women|SLBW/i.test(league)) return;
    const teamOne = card.find('[fs-list-field="teamOne"]').first().text().trim();
    const teamTwo = card.find('[fs-list-field="teamTwo"]').first().text().trim();
    const designatedHome = teamOne === club_name;
    const homeFlag = visible(card.find('.game-location.home'));
    const awayFlag = visible(card.find('.game-location.away'));
    const venueEl = card.find('.game-location.venue');
    const venueName = visible(venueEl) ? venueEl.find('.home-away-txt').text().trim() : null;
    cards.push({
      league,
      date: parseDate(card.find('.text-block-14').first().text()),
      time: parseTime(card.find('.fixture-time-badge-text').first().text()),
      designated_home: designatedHome,
      opponent_name: designatedHome ? teamTwo : teamOne,
      flag: homeFlag ? 'HOME' : awayFlag ? 'AWAY' : null,
      venue_name: venueName || null,
      neutral: awayFlag && Boolean(venueName),
      cancelled: visible(card.find('.cancelled-game')),
      url: card.find('a[href^="/fixtures/"]').first().attr('href') ?? null,
    });
  });
  return cards;
}
