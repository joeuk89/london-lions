# League news: a free source to replace Hoopsfix for SLB stories

Resolves [issue #24](https://github.com/joeuk89/london-lions/issues/24). Observed on 2026-10-23 by fetching each source with plain curl from a home connection, then parsing it with `parseFeed`, `articleText` and `articleDate` from `src/programme/news.js`. Nothing here was run from an Actions runner; the runner column says what a probe run still has to confirm.

## Answer

No free source gives the SLB's own league stories (weekly round-ups, signings across the league) as full text from a runner. Only the SLB site writes those, and it blocks cloud addresses ([#21](https://github.com/joeuk89/london-lions/issues/21)). The best free replacement is a pair:

- **Google News RSS search** for league-wide and opponent headlines. Free, no key, dated, updated daily. Two queries per fixture cover it: `site:superleaguebasketballm.co.uk when:21d` returns the SLB's own headlines with publish dates, and `"<opponent name>" when:21d` returns opponent stories from any publisher. Items carry only a headline, publisher and date; their links point at Google, not the publisher.
- **Newham Recorder sport RSS** (`https://www.newhamrecorder.co.uk/sport/rss/`) for Lions match reports with full text. It is the Lions' local paper and publishes about one Lions story a week in season.

Keep the Hoopsfix entry: it costs one request, fails quietly when empty, and its feed still answers 200 if posting resumes.

## Candidates

| Source | Free, no login | Format | Dated | SLB / Lions volume | Runner risk |
| --- | --- | --- | --- | --- | --- |
| Google News RSS search | Yes | RSS 2.0, headline only | Yes (`pubDate`) | High: SLB site query had 15 items in the 4 weeks to 20 Oct; "London Lions" query 26 items in 3 weeks | Unknown; Google sometimes throttles datacenter addresses |
| Newham Recorder sport RSS | Yes | RSS 2.0, short description; article page has full text | Yes (`pubDate`, `article:published_time`) | Lions only: 8 Lions stories 9 Aug to 22 Oct | Low; no bot wall seen |
| BBC Sport basketball RSS | Yes | RSS 2.0, summary; article page has full text | Yes | Very low: 17 items over 16 months, 1 about the Lions | Low; BBC's own servers |
| Hoopsfix RSS | Yes | RSS 2.0, full text | Yes | None since 5 Aug 2026 | Cloudflare; worked before |
| SLB women's site feed | Yes | RSS 2.0, full text | Yes | Women's league only | Same Genius Sports host as the men's site, so the same block |
| Bing News RSS | Yes | RSS 2.0, headline only | Yes | Low: 9 SLB items back to 2024; 2 Lions items in 9 days | Unknown |
| Sports Gazette tag feed | Yes | RSS 2.0, full text | Yes | Student outlet; last Lions story 18 May 2026 | Cloudflare |
| Guardian, City AM, Eurohoops, Sportando, Leicester Mercury, Manchester Evening News feeds | Yes | RSS 2.0 | Yes | None in the current feed window; Eurohoops and Sportando `london-lions` tag feeds are empty | Mixed |
| Wayback Machine copy of the SLB feed | Yes | — | — | No captures exist | — |
| Guardian Open Platform, NewsAPI and similar | Need an API key | — | — | Ruled out | — |
| Third-party feed relays (rss2json, a self-hosted proxy) | — | — | — | Ruled out in #21 under the free, minimal-infra preference | — |

## Findings by source

### Google News RSS search

URL shape: `https://news.google.com/rss/search?q=<query>&hl=en-GB&gl=GB&ceid=GB:en`. No key and no login. `when:21d` in the query limits results to the news window's maximum.

- **What a query returns.** Up to 100 `<item>`s, each with `title` ("headline - Publisher"), `pubDate`, a `<source url="...">` naming the publisher, and a `description` that holds only the headline again as a link. `parseFeed` reads these as-is and every item had a date.
- **SLB's own stories.** `site:superleaguebasketballm.co.uk` returned 100 items; the newest was 20 Oct, and 15 fell in the four weeks before that. Google indexes the SLB site, so its round-up and signing headlines reach us with dates even though the site blocks runners.
- **Opponent and Lions stories.** `"London Lions" basketball` gave 26 items in the three weeks to 22 Oct across 18 publishers. Many are not articles: DAZN watch pages, Sofascore, Flashscore and 365Scores score pages. A publisher denylist removes them.
- **Links are Google redirects.** Each `link` is `news.google.com/rss/articles/<id>`, a JavaScript page, not the article. The gather step today fetches `item.url` for text when the feed carries less than `FULL_TEXT`, so it would read Google's page. Google's own `batchexecute` endpoint (rpc `Fbv4je`, signed by the page's `data-n-a-sg` and `data-n-a-ts` attributes) turns the id into the publisher URL; three of three decoded here. It is undocumented and has changed before, so treat it as a best effort.
- **Even decoded, SLB pages stay blocked.** A decoded SLB link still points at `superleaguebasketballm.co.uk`, which 403s from runners. SLB items can only be headlines.
- **Runner risk.** Google sometimes answers datacenter traffic with a 429 or a `/sorry/` captcha page. It returned 200 from here; only a probe run settles it.

### Newham Recorder

`https://www.newhamrecorder.co.uk/sport/rss/` returned 50 items (9 Aug to 22 Oct), 8 about the Lions men or women, the rest mostly West Ham. Descriptions are short (about 140 characters), so the gather step fetches the article. The article URL in the feed redirects once (follow redirects). `articleText` read the match report cleanly and `articleDate` read `2026-10-19T08:36:33Z` from the page. It covers the Lions only, never opponents.

### BBC Sport

`https://feeds.bbci.co.uk/sport/basketball/rss.xml` answered 200 from BBC's own servers. It held 17 items from June 2025 to 22 Oct 2026, mostly NBA; one was about the Lions (17 Sep). Article pages give a clean `articleText` and an `articleDate`. Reliable but too rare to matter; Google News already surfaces BBC stories.

### SLB site through another host

Both `www.superleaguebasketballm.co.uk` and `www.superleaguebasketballw.co.uk` are CNAMEs for `web.geniussports.com` (AWS addresses `50.112.26.22`, `52.13.167.170`). The 403 in #21 came from that load balancer, which blocks by address, not hostname, so the women's site and any other Genius-hosted name will fail the same way. The Wayback Machine has no captures of the SLB news feed.

### Hoopsfix

`https://www.hoopsfix.com/feed/` and the `slb` category feed both answer 200 through Cloudflare. The newest item is 5 Aug 2026. It is dormant, not gone.

### Sites with no usable SLB coverage

Guardian basketball, City AM, Eurohoops and Sportando publish many items a day but none about the SLB in their current feed windows, and their `london-lions` tag feeds are empty. Reach's Leicester Mercury and Manchester Evening News sport feeds carry football. BasketNews has no RSS and sits behind Cloudflare. `britishbasketball.com` timed out.

## Open questions for a follow-up

- **Runner probe.** Fetch a Google News search feed, one `batchexecute` decode and the Newham Recorder feed from an Actions runner, as #21 did for the SLB site.
- **Headline-only items.** Decide how the gather step and the writing step treat an item with a headline, publisher and date but no text: pass it as a headline, or drop it. SLB items from Google News can only ever be headlines.
- **Config shape.** Add a `kind: "google-news"` source with a query template (`{opponent}`), a publisher denylist, and optional link decoding; add Newham Recorder as an RSS source kept by Lions mention.
