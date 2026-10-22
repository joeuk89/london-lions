# Opposition sources: where each opponent publishes news and rosters

Research for [issue #7](https://github.com/joeuk89/london-lions/issues/7). Checked 2026-10-22 with plain `curl` and a desktop Chrome User-Agent, no JavaScript.

**Fetch result** means what an unattended `curl` gets back:

- **Plain HTML**: the article titles or player names are in the response body.
- **JS-rendered**: the page returns 200 but the content is filled in by JavaScript, so a plain fetch sees nothing useful.
- **Blocked**: the server refuses or challenges non-browser requests.
- **Stale**: the page fetches fine but the club has stopped updating it.

## Answer in short

- **Rosters and form need no per-club scraping.** The Genius Sports hosted pages cover every SLB club and the EuroLeague public API covers every EuroCup club, both as plain responses.
- **News needs per-club fetching.** 13 of the 16 opponents publish news on a plain-HTML site, and 9 of those also expose a WordPress or TYPO3 RSS feed, which is the easiest thing to poll. Three clubs (Cheshire, Liverpool, Maxima Roma) have no usable club news page; Cheshire's is stale and the other two have none.
- **Injury information has no dedicated source anywhere.** No club or league page publishes an injury list. Availability news only appears inside match previews and signing or departure articles, so it has to be read out of the news feed.
- **The EuroCup website is blocked** (Vercel security checkpoint, HTTP 429), but its data is all in the public API, so nothing is lost.

## League-level sources

### SLB: Genius Sports hosted pages

Base: `https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/` (49597 is Championship 26-27; Cup 26-27 is 49599). Every page below returned 200 with the content in the HTML. The pages are server-rendered with jQuery and FooTable for sorting, but the data is already in the markup.

| Page | URL pattern | What it holds |
| --- | --- | --- |
| Teams | `.../teams` | All 10 clubs with their team ids |
| Standings | `.../standings` | League table |
| Team summary | `.../team/<id>` | Last 5 results and next 5 fixtures (form), plain HTML |
| Team roster | `.../team/<id>/roster` | Shirt number, name, position, height, weight, age, DOB, nationality |
| Team statistics | `.../team/<id>/statistics` | Per-player season averages |

Team ids: Manchester Basketball 178234, B. Braun Sheffield Sharks 178235, Newcastle Eagles 178236, Bristol Flyers 178237, Surrey 89ers 178238, Caledonia Gladiators 178239, Cheshire Phoenix 178240, Leicester Riders 178241, London Lions 178242, Liverpool Basketball 201265.

Not covered: news, injuries, coaching staff, player photos.

The league's own site `https://www.superleaguebasketballm.co.uk/` (WordPress, plain HTML) has `/news/` and `/clubs/` pages; its stats pages embed the same Genius Sports widgets. Its `/feed/` returns 404.

### EuroCup: EuroLeague public API

Base: `https://api-live.euroleague.net/v2/competitions/U/seasons/U2026/`. JSON, no key needed, all returned 200.

| Endpoint | What it holds |
| --- | --- |
| `clubs` | All 32 clubs with code, name, city, official website, Twitter handle, crest |
| `clubs/<code>` | One club's profile |
| `clubs/<code>/people` | Full roster and staff: name, dorsal, position, height, birth date, nationality, previous team, `active` flag |
| `games` | All 224 regular-season games with group, round, date, venue, scores, `played` flag (form is derived from these) |
| `standings` | 404 on v2; derive from `games` |

Lions code is `LLI`. Group B opponents and codes: Umana Reyer Venice `VNC`, Maxima Roma `MRO`, Turk Telekom Ankara `TTK`, U-BT Cluj-Napoca `CLU`, Skyliners Frankfurt `FRA`, La Laguna Tenerife `TNF`, Siauliai Basketball `SIA`.

Not covered: news, injuries. The public website `https://www.euroleaguebasketball.net/en/eurocup/...` answers with a Vercel Security Checkpoint and HTTP 429 to plain requests, so treat it as blocked.

## Per-club sources

### SLB Championship 26-27

| Opponent | Club news | Club roster | League profile | Fetch result |
| --- | --- | --- | --- | --- |
| Bristol Flyers | [mens-first-team](https://www.bristolflyers.co.uk/mens-first-team/), RSS [/feed/](https://www.bristolflyers.co.uk/feed/) | [players](https://www.bristolflyers.co.uk/match-centre/teams/bristol-flyers/players/) | [178237](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178237) | Plain HTML (WordPress). News dated 22 Oct 2026. |
| Caledonia Gladiators | [news](https://caledoniagladiators.com/news/), RSS [/feed/](https://caledoniagladiators.com/feed/) | [mens-team-roster](https://caledoniagladiators.com/mens-team-roster/) | [178239](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178239) | Plain HTML (WordPress). News dated 18 Oct 2026. News page mixes men's and women's. |
| Cheshire Phoenix | [news](https://cheshirephoenix.com/news/), RSS [/feed/](https://cheshirephoenix.com/feed/) | [roster](https://cheshirephoenix.com/roster/) | [178240](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178240) | Roster plain HTML. News **stale**: newest feed item 26 Dec 2024, listing page shows 2021-22 posts. Use Hoopsfix and socials. |
| Leicester Riders | [men/mens-news](https://riders.basketball/men/mens-news/), RSS [/feed/](https://riders.basketball/feed/) | [men/men-roster](https://riders.basketball/men/men-roster/) | [178241](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178241) | Plain HTML (WordPress). Domain is `riders.basketball`; `leicesterriders.co.uk` redirects there. News dated 22 Oct 2026. |
| Liverpool Basketball | none | none | [201265](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/201265) | Site `liverpoolbasketball.com` is a one-page Duda site about the community club with no news or roster. Genius roster lists the pro squad. Use Hoopsfix and socials for news. |
| Manchester Basketball | [news](https://www.manchester.basketball/news) | [rosters](https://www.manchester.basketball/rosters) | [178234](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178234) | News plain HTML (Webflow, dated 20 Oct 2026, no RSS). Roster **JS-rendered**: page has headings only, no player names. Use Genius roster. |
| Newcastle Eagles | [category/news](https://newcastle-eagles.com/category/news/), RSS [/feed/](https://newcastle-eagles.com/feed/) | [roster](https://newcastle-eagles.com/roster/) | [178236](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178236) | Plain HTML (WordPress). News dated 19 Oct 2026. Feed mixes men's, women's, foundation and arena news; `category/news/bbl-news/` narrows it. |
| B. Braun Sheffield Sharks | [news](https://sheffieldsharks.co.uk/news) | [roster](https://sheffieldsharks.co.uk/roster) | [178235](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178235) | Plain HTML (Statamic). No RSS found. Roster has one page per player under `/roster/<slug>`. |
| Surrey 89ers | [category/news](https://surrey89ers.basketball/category/news/) | [roster-26-27](https://surrey89ers.basketball/roster-26-27/) | [178238](https://hosted.dcd.shared.geniussports.com/SLB/en/competition/49597/team/178238) | Plain HTML (WordPress). News dated 17 Oct 2026. `/feed/` returns the homepage, not RSS. `surrey89ers.com` is a parked domain; `surrey89ers.co.uk` redirects to `surrey89ers.basketball`. |

### EuroCup Group B

| Opponent | Club news | Club roster | League profile | Fetch result |
| --- | --- | --- | --- | --- |
| Umana Reyer Venice (ITA) | [news/maschile](https://www.reyer.it/news/maschile/), RSS [/feed/](https://www.reyer.it/feed/) | [maschile/roster](https://www.reyer.it/maschile/roster/) | API `clubs/VNC` | Plain HTML (WordPress), Italian. News dated 21 Oct 2026. |
| Maxima Roma (ITA) | none | none | API `clubs/MRO` | `maximaroma.it` is a one-page WordPress launch site; `/feed/` has zero items and the roster anchor shows placeholders. New club this season. Use the API roster and socials. |
| Turk Telekom Ankara (TUR) | [haberler](https://turktelekombasketbol.com.tr/haberler) | [a-takim-oyunculari](https://turktelekombasketbol.com.tr/a-takim-oyunculari) | API `clubs/TTK` | Plain HTML (Umbraco), Turkish. News dated 26 Sep 2026. No RSS. The API's listed site `turktelekomspor.com.tr/basketbol` returns 404. |
| U-BT Cluj-Napoca (ROU) | none fetchable | none fetchable | API `clubs/CLU` | `u-bt.ro` is an Angular single-page app: 29 KB shell with no content, sitemap empty, and its `one.u-bt.ro/api/*` calls return 404 unauthenticated. **JS-rendered**. Use the API roster and socials. |
| Skyliners Frankfurt (GER) | [news-archiv](https://www.frankfurt-skyliners.de/news-service/news-archiv), RSS [/feed.rss](https://www.frankfurt-skyliners.de/feed.rss) | [teams/easycredit-bbl](https://www.frankfurt-skyliners.de/teams/easycredit-bbl) | API `clubs/FRA` | Plain HTML (TYPO3), German. Feed has 50 items, newest 22 Oct 2026. Roster is an HTML table. |
| La Laguna Tenerife (ESP) | [noticias](https://cbcanarias.net/noticias/), RSS [/feed/](https://cbcanarias.net/feed/) | [equipo](https://cbcanarias.net/equipo/) | API `clubs/TNF` | Plain HTML (WordPress), Spanish. News dated 22 Oct 2026. Site has per-fixture event pages, including `event/la-laguna-tenerife-vs-london-lions/`. |
| Siauliai Basketball (LTU) | [naujienos](https://bcsiauliai.lt/naujienos/), RSS [/feed/](https://bcsiauliai.lt/feed/) | [komanda](https://bcsiauliai.lt/komanda/) | API `clubs/SIA` | Plain HTML (WordPress), Lithuanian. News dated 20 Oct 2026. |

## Secondary sources worth keeping

- **Hoopsfix team pages**, for example `https://www.hoopsfix.com/bbl/bristol-flyers`: plain HTML, 200, lists the site's articles about that club. Fills the news gap for Cheshire and Liverpool.
- **EuroLeague API `clubs`**: carries each club's Twitter handle, so social lookups need no per-club config.

## Recommendations for the programme pipeline

1. **Roster and form**: read Genius Sports (SLB) and the EuroLeague API (EuroCup). Do not scrape club roster pages.
2. **News**: poll the RSS feed where one exists, else the news listing page. Filter Caledonia and Newcastle to men's items.
3. **Injuries and availability**: extract from the club news items for both sides; there is no list to fetch.
4. **Fallback** for Cheshire, Liverpool, Maxima Roma and U-BT Cluj: Hoopsfix for the SLB pair, the API roster plus socials for the EuroCup pair.
5. **Localisation**: five EuroCup feeds are in Italian, Turkish, German, Spanish and Lithuanian. The programme generator will have to translate or summarise them.
