# Fixture data: exact shape of the three fixture sources

Resolves [issue #2](https://github.com/joeuk89/london-lions/issues/2). Observed on 2026-10-22 by fetching each source directly with curl. Counts and examples are from that day's data.

## Summary

- **Only two sources carry a stable per-fixture id**: Genius Sports (numeric match id in `extfix_<id>`) and the EuroLeague API (`gameCode` / `identifier`). The club page has none; its slug is frozen at creation and lies after a reschedule.
- **Cross-source identity has to be derived** from `(competition, UK calendar date, opponent)` with an opponent alias table. All three sources agree on date for every fixture checked; times agree once converted to UK local.
- **The club page is the only source that states a venue change**, but it does so by venue name only (no address), and it gives no venue at all for away fixtures. Genius Sports gives a venue for every SLB fixture; the EuroLeague API gives venue name, code and street address for every EuroCup fixture.
- **No source was seen expressing a cancellation or postponement** in the current or last season. The club template has a conditional "Cancelled/Forfeited" block and a free-text message field; the EuroLeague API has `gameStatus`, `confirmedDate` and `confirmedHour` fields; Genius Sports has a status span that only showed "Final", "Live now" or the kick-off time.
- **The club page lists neutral-venue finals with a venue**, flagged AWAY even when the venue is in London (The O2, May 2026).

## Source 1: club schedule page and per-fixture pages

URL: <https://www.thelondonlions.com/schedule>. A Webflow CMS collection list rendered server-side, so the fixture cards are in the raw HTML (no JavaScript needed to read them). Finsweet list attributes (`fs-list-*`) drive the filters and "infinite" load client-side.

### What the schedule page contains

One `div.main-fixtures.w-dyn-item` per card. On 2026-10-22 the HTML held 112 cards covering men's and women's teams:

- Upcoming fixtures in ascending date order (Oct 24 2026 to Apr 23 2027), then last season's results in descending order (May 17 2026 back to Sep 23 2025).
- **This season's played games are absent** from the schedule HTML (nothing between Sep 18 and Oct 21 2026), although their per-fixture pages exist and show scores. Treat the page as "upcoming plus last season", not a full-season list.
- Women's cards are mixed in and distinguished only by the competition text (`SLBW Championship`) and the hidden `Gender` filter checkbox.

### Field-by-field (per card)

| Field | Where | Observed values and notes |
| --- | --- | --- |
| Date | `div.text-block-14` | `Oct 24, 2026`. Trusted; matched the other two sources on every fixture checked, including ones whose slug disagrees. |
| Day name | `div.day` | `Sat`. Derived from the date. |
| Time and zone | `div.fixture-time-badge-text` | Free text typed by the club. Seen: `18:00 BST`, `19:30 GMT`, `1930 GMT` (no colon, twice), `15:00 BST` on Nov 22 2026 (wrong zone, GMT applies). Read the time as UK local and ignore the zone label. |
| Competition | `div[fs-list-field="league"]` | `SLB Championship`, `SLB Cup`, `SLB Trophy`, `EuroCup` this season. Last season used bare `SLB` for championship games. Play-off games were labelled `SLB`, not `SLB Play-offs`. |
| Home side | `div[fs-list-field="teamOne"]` | Always the designated home side; confirmed by the per-fixture JSON-LD `homeTeam`. |
| Away side | `div[fs-list-field="teamTwo"]` | Designated away side. Placeholder `TBC` seen for the Jan 10 2027 SLB Cup opponent. |
| Home/away flag | `div.game-location.home` or `.away`, the other carries `w-condition-invisible` | Also the `Type` filter: `true` = HOME, `false` = AWAY (the `?0_type_equal=["true"]` query string on the page's own links). |
| Venue | `div.game-location.venue > div.home-away-txt` | Present only on HOME cards and on neutral finals. Names only, no address: `Copper Box Arena`, `NCC Fitness` (the Genius Sports "New City College Hackney"), `Crystal Palace National Sports Centre`, `O2 Arena London`, `AO Arena Manchester`, `Utilitia Arena Birmingham` (sic). Away cards have no venue element at all. |
| Training-ground flag | `div.game-location.training-ground` (label `UEL`) | Conditional block; visible once, on the Dec 14 2025 Trophy game at NCC Fitness. |
| Cancelled flag | `div.cancelled-game` with static text `Cancelled/Forfeited` | Conditional on a CMS switch. Not visible on any of the 112 cards. The label is template text, so it cannot tell cancelled from forfeited. |
| Special message | `div.special-message > div.cancelled-txt.custom` | A free-text CMS field, empty (`w-dyn-bind-empty`) on every card. Presumably where a postponement note would go. |
| Score | `h3.match-report-score1/2`, `h3.finalscoretext` | Empty on upcoming cards. |
| Links | `a[href^="/fixtures/"]`, Ticketmaster, fanbaseclub | Per-fixture page, ticket links. |

### Per-fixture pages

URL pattern for upcoming games: `/fixtures/<month>-<day>-<year>-<hh>-<mm>-<ss>`, for example `/fixtures/october-24-2026-18-00-00`. Last season's results were renamed to `/fixtures/<home>-vs-<away>-<score>` (`/fixtures/leicester-riders-vs-london-lions-70-89`), so the URL changes after the game.

The page repeats the card fields (competition, teams, date, time badge, venue, HOME/AWAY) and adds a score and a game report once played. It carries one `application/ld+json` block:

```json
{
  "@type": "SportsEvent",
  "name": "London Lions vs Bristol Flyers",
  "startDate": "2026-10-24",
  "url": "https://www.thelondonlions.com/fixtures/october-24-2026-18-00-00",
  "homeTeam": { "@type": "SportsTeam", "name": "London Lions" },
  "awayTeam": { "@type": "SportsTeam", "name": "Bristol Flyers" }
}
```

The JSON-LD has **no time, no venue, no location, no status**. `startDate` is a bare date. It only adds a clean home/away pair to what the card already says.

### Slug quirks

- **The slug is frozen at creation.** The EuroCup trip to Tenerife is dated Dec 8 2026 on the card and in the EuroLeague API, but its slug is `december-9-2026-20-00-00`. The Ankara trip is `16:30 GMT` on the card and `16:30Z` in the API, but its slug ends `16-00-00`. A reschedule changes the card and leaves the URL.
- **The "3036" slug** is `/fixtures/october-24-3036-18-00-00`: a women's fixture (Leicester Riders v London Lions, SLBW Championship) whose year was typed as 3036 and whose time later moved from 18:00 to 15:30. The page exists and renders normally. It is a typo in a women's card, so it is filtered out by competition, but it shows that slugs are hand-generated and never corrected.
- The sitemap lists `march-28-2027-16-00-00-2`, a duplicate-slug suffix, and a results slug that returns 404. Do not use the sitemap as a fixture list.

### How changes show up

- **Addition**: a new card and a new per-fixture page. Two Genius Sports fixtures (Dec 2 2026 and Apr 13 2027, both v Caledonia Gladiators) had no club card on 2026-10-22, so the club page can lag the league.
- **Reschedule**: date and time badge change in place; slug and URL do not.
- **Cancellation**: the `cancelled-game` block becomes visible with the fixed label; an optional note in `special-message`. Not observed.
- **Venue change**: the venue name on a HOME card changes (Crystal Palace, May 3 2026). No address anywhere on the site, so the address lookup must be ours.

### Neutral-venue finals

Yes, listed with a venue and flagged AWAY regardless of city:

| Date | Competition | Card | Venue |
| --- | --- | --- | --- |
| Feb 15 2026 | SLB Cup | London Lions v Cheshire Phoenix, AWAY | Utilitia Arena Birmingham |
| Mar 22 2026 | SLB Cup | Manchester Basketball v London Lions, AWAY | AO Arena Manchester |
| May 17 2026 | SLB (play-off final) | Cheshire Phoenix v London Lions, AWAY | O2 Arena London |

So "AWAY flag plus a venue element" is the club page's signal for a neutral final. The glossary's "home fixture = played in London" rule needs the venue name (The O2) to classify May 17 as home; the flag alone says away.

## Source 2: Genius Sports hosted SLB team schedule

URL: <https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178242/schedule>. Server-rendered HTML, one competition per page. 34 Championship fixtures on 2026-10-22, six already played.

### Field-by-field (per `div.match-wrap`)

| Field | Where | Notes |
| --- | --- | --- |
| Match id | `id="extfix_2882472"` | Numeric, stable, also in the box-score link `/competition/49597/match/2882472/boxscore`. |
| Tip-off | `div.match-time span` | `Oct 24, 2026, 6:00 PM`. No zone anywhere on the page; all SLB venues are UK so read as UK local. Matches the club badge on every fixture checked. |
| Venue | `a.venuename` with `/venue/<id>` link | Every fixture has one, home and away: `Copper Box Arena`, `New City College Hackney`, `Cheshire Oaks Arena`, `The O2`. Venue page gives a name and a street line only (`Falkirk Strett` for NCC), no postcode. |
| Home side | `div.home-team a[title]` with `/team/<id>` | Listed first. Lions are team 178242. |
| Away side | `div.away-team a[title]` | |
| Status | `span.matchStatus` | `Final` when played; the tip-off text repeated when upcoming; `Live now` plus period and clock during play. No cancelled, postponed or TBC string in this season's 34 rows or last season's 26 rounds. |
| Score | `div.fake-cell` | `&nbsp;` until played. |
| Competition | Page scope, not per row | Competition ids from the page's selector: Championship 26-27 `49597`, Cup 26-27 `49599`. Play-offs and Trophy 26-27 not yet listed. 2025-26: Championship `41897`, Cup `47714`, Trophy `42212`, Play-offs `48758`. `/competition/all/team/178242/schedule` returned only the Championship rows. |

### Quirks

- Team schedule pages for last season's competitions return HTTP 500; the competition-level `/competition/<id>/schedule` pages (round by round) work.
- The Cup page lists the Jan 10 2027 tie with London Lions as the only named team and no opponent (club shows `TBC`).
- Two match ids sit outside the season's contiguous block (`2886240`, `2925013`, both v Caledonia). They look like fixtures added after the original release, so an addition or a re-issued fixture gets a new id. Whether a plain reschedule keeps its id was not observable.
- The 2025-26 play-off final at The O2 lists London Lions as the home team. Genius Sports always designates a home side, even at a neutral venue, and nothing marks neutrality.

### How changes show up

- **Addition**: a new `match-wrap` with a new id.
- **Reschedule**: tip-off text changes; id presumed stable (unverified).
- **Cancellation**: nothing observed. Expect the row to vanish or the status span to change; the sync should treat a disappeared id as a withdrawal.
- **Venue change**: `a.venuename` and its `/venue/<id>` change.

## Source 3: EuroLeague public API

URL: <https://api-live.euroleague.net/v2/competitions/U/seasons/U2026/games>. Open JSON, no key needed for this endpoint (the published Swagger declares an `API Key` header but the paths list is empty, so the schema below is from the live response). Returns `{ "data": [...], "total": 224 }` with every EuroCup game; filter on `local.club.code == "LLI"` or `road.club.code == "LLI"` (14 games). `/games/<gameCode>` returns one game with the same shape. The v3 path returns 405.

### Field-by-field (per game)

| Field | Example | Notes |
| --- | --- | --- |
| `gameCode`, `identifier`, `id` | `71`, `U2026_71`, UUID | Stable ids. `identifier` is unique across seasons. |
| `season.code`, `season.name` | `U2026`, `EuroCup 2026-27` | |
| `phaseType.code` / `.name`, `round`, `roundName`, `group.name` | `RS` / `Regular Season`, `5`, `Round 5`, `Group B` | Last season's codes: `RS`, `8F`, `4F`, `2F`, `Final`. |
| `date` | `2026-10-28T20:30:00` | Central European time (UTC+1/+2), not local and not UTC. Do not use. |
| `localDate` | `2026-10-28T19:30:00` | Venue local time. |
| `localTimeZone` | `0` | Venue UTC offset in hours at game time (London 0 or 1, Ankara 3, Tenerife 0). |
| `utcDate` | `2026-10-28T19:30:00Z` | The field to store. Matched the club badge on every Lions game. |
| `confirmedDate`, `confirmedHour` | `true`, `true` | Both true on all 419 games across two seasons. Presumably false while a slot is TBC. |
| `played`, `gameStatus`, `winner` | `false`, `"Confirmed"`, `null` | `gameStatus` was `Confirmed` on all 419 games; other values not observed. |
| `local.club` / `road.club` | `{ code: "LLI", name: "London Lions", abbreviatedName, editorialName, tvCode, images.crest }` | `local` is home. Scores and quarter partials sit alongside. |
| `venue` | `{ name: "COPPER BOX ARENA", code: "LON1", capacity, address: "...", active, notes }` | Name in capitals; `address` is a street address string (country included). The only source with addresses. |
| `isNeutralVenue` | `false` | Explicit neutral flag; false on all 419 games including last season's final. |
| `audience`, `referee1..4`, `socialFeed`, `operationsCode` | | Filled after the game or unused. |

### How changes show up

- **Addition**: a new element in `data` with a new `gameCode`; `total` increases.
- **Reschedule**: `utcDate`, `localDate` and `date` change in place; ids stable. `confirmedDate` / `confirmedHour` may go false while unresolved.
- **Cancellation**: no observed example. `gameStatus` is the field to watch; log any value other than `Confirmed`.
- **Venue change**: `venue` object changes; `isNeutralVenue` flips for a relocated final.

## Deriving a stable per-fixture identity

No id is shared across sources, so the sync needs its own key:

1. **Competition**: from the club `league` text, the Genius Sports competition id, or the EuroLeague season code.
2. **UK calendar date**: club card date; Genius tip-off date; EuroLeague `utcDate` converted to Europe/London.
3. **Opponent**, normalised through an alias table. Names differ: club `Turk Telekom Ankara` and `Maxima Roma` versus EuroLeague codes `TTK` and `MRO`; club `NCC Fitness` versus Genius `New City College Hackney`; `B. Braun Sheffield Sharks` on both UK sources. Use the EuroLeague club code and the Genius team id as canonical where available.

Key: `<competition>:<yyyy-mm-dd>:<opponent-key>`. A reschedule across days changes the key, so match a disappeared key to a new one by (competition, opponent, home/away) within the same season before treating it as a cancellation plus an addition. Record the Genius match id and the EuroLeague `identifier` on the fixture once matched, and prefer them for subsequent diffs. Never use the club slug as identity.

## Open points for the sync design

- The club page omits this season's played fixtures, and omitted two league-listed fixtures on the day of checking, so "club page is source of truth" only holds for fixtures it shows. Additions must be accepted from the league sources.
- Home/away for a neutral final in London: the club flag says AWAY, Genius says Lions home, EuroLeague would say `isNeutralVenue`. The glossary rule (both home and away) needs the venue name to decide "in London".
- Venue addresses come only from the EuroLeague API. SLB venue addresses must be a hand-kept table keyed on Genius venue id.
- Nothing verified for cancellations or postponements. Log every unfamiliar status value and every disappeared id rather than guessing.
