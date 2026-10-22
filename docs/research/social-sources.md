# Social media as a programme source: viability

Resolves [issue #3](https://github.com/joeuk89/london-lions/issues/3). Probed on 2026-10-22 with plain `curl` (desktop Chrome user agent, no cookies) from a UK IP, plus the platforms' own developer docs.

## Answer

Keep **YouTube**. Drop **X, Instagram, TikTok and Facebook** as programme sources.

Only YouTube publishes a route that is official, free, anonymous and stable: the per-channel Atom feed. Every other platform either hides posts behind a login, serves an empty shell to anonymous requests, or offers a paid or gated API. The third-party bridges that used to fill the gap (Nitter, RSS-Bridge, Instagram mirrors) are dead, blocked or need a logged-in account.

Programme value is also limited. The posts worth having (injury news, roster changes, fixture moves) appear as articles on the club website, which other tickets cover. Social adds highlights and hype, which the YouTube feed supplies.

## Per platform

| Platform | Anonymous route | Status on 2026-10-22 | Official API for reading someone else's posts | Verdict |
| --- | --- | --- | --- | --- |
| YouTube | Atom feed `https://www.youtube.com/feeds/videos.xml?channel_id=UCBKv-7gkxC6kA-_yOB1JMiw` | 200, 15 entries, titles, dates, view counts | Data API v3: free, API key only, 10,000 units/day | Include |
| X | None. Profile HTML is an empty shell. Syndication endpoint returns 429. Nitter is shut down. | Blocked | Pay-per-use only, $0.005 per post read, card required | Drop |
| Instagram | None. Profile HTML has no post data. `web_profile_info` returns 401 "require_login". | Blocked | Business Discovery: needs your own professional account, a linked Facebook Page, app review | Drop |
| TikTok | Profile HTML carries follower counts but an empty `itemList`. The `item_list` API returns an empty 200. | Blocked | Display API needs the target user's OAuth login. Research API is for approved academic bodies. | Drop |
| Facebook | Page URL returns 400 for anonymous requests. Page plugin renders no post text. | Blocked | Page Public Content Access: app review plus business verification | Drop |

## Evidence

### YouTube

- Channel page `https://www.youtube.com/@LDNLions` returns 200 and embeds the channel id `UCBKv-7gkxC6kA-_yOB1JMiw` and the feed path.
- The feed `https://www.youtube.com/feeds/videos.xml?channel_id=UCBKv-7gkxC6kA-_yOB1JMiw` returns 200 with no user agent and no cookie. Atom with `media:group` extensions, 15 most recent uploads, each with title, `published`, video id and view count. The feed title is "London Lions Basketball".
- Fallback if the feed ever needs more than 15 items: [YouTube Data API v3](https://developers.google.com/youtube/v3/getting-started). Default quota is 10,000 units per day, list calls cost 1 unit, and list methods "support unauthorized requests" that "only retrieve public data" with an API key.

### X

- `https://x.com/LondonLions` returns 200 but the body is a client-side shell. No `full_text` or `tweetText` markers. The only usable data is the `og:description` bio: "This is London Basketball. 2025-26 SLB Quadruple Champions. #WeAreLondon".
- The embedded-timeline syndication endpoint `https://syndication.twitter.com/srv/timeline-profile/screen-name/LondonLions` returned 429 "Rate limit exceeded" on three attempts spaced minutes apart. `cdn.syndication.twimg.com/timeline/profile` returns 200 with an empty body.
- Nitter: `nitter.net` returns 410, `xcancel.com` returns 451, `nitter.space` and `lightbrd.com` return 403 bot checks. The project's GitHub repository was archived on 2026-09-11 after X sent cease-and-desist letters in August 2026 ([Wikipedia](https://en.wikipedia.org/wiki/Nitter), [Privacy Guides thread](https://discuss.privacyguides.net/t/x-com-sends-privacy-frontend-nitter-a-cease-and-desist-permanently-shuts-it-down/40200)).
- Official API: X moved to pay-per-usage. The [pricing page](https://docs.x.com/x-api/getting-started/pricing) lists $0.005 per post read, no free tier, a saved payment card for the $20 promotional credit, and a 3 million reads per month cap. Reading one account's timeline once a game morning would cost cents, but it is not free and needs a developer account and card on file.

### Instagram

- `https://www.instagram.com/londonlions/` returns 200 with a 584 KB body that contains no shortcodes, captions or timeline edges. The title is just "Instagram".
- `https://www.instagram.com/londonlions/?__a=1&__d=dis` returns an empty 201.
- `https://i.instagram.com/api/v1/users/web_profile_info/?username=londonlions` with the public web app id returns 401: `{"message":"Please wait a few minutes before you try again.","require_login":true}`.
- `https://www.instagram.com/londonlions/embed/` returns 200 but the body carries no media.
- Official API: [Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview) says reading accounts you do not own requires Advanced Access, which needs app review and business verification. [Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/business_discovery) runs on your own Business or Creator account, needs `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`, and the Facebook Login configuration needs a linked Facebook Page.
- Bridges: [RSS-Bridge's Instagram bridge](https://rss-bridge.github.io/rss-bridge/Bridge_Specific/Instagram.html) requires `session_id` and `ds_user_id` cookies from a logged-in dedicated account and warns of 429 rate limiting. The public instance `rss-bridge.org/bridge01` returned 500 for the Instagram, Facebook and Twitter bridges. Four other public instances were unreachable or returned 400 or 503. Mirrors `picuki.com`, `picnob.com` and `imginn.com` return 403. `greatfon.com` returns 200 but serves a bot check.

### TikTok

- `https://www.tiktok.com/@londonlions` returns 200. The `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON carries the bio, `secUid`, 83,100 followers and 1,157 videos, but `itemList` is `[]`. Video data is loaded client-side after the page runs.
- `https://www.tiktok.com/api/post/item_list/?secUid=...` returns 200 with an empty body, with or without browser-style query parameters and a referer. The endpoint needs signed request parameters that a real browser session generates.
- oEmbed `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@londonlions` returns 200 with a profile card only, no videos.
- Official API: the [Display API get started page](https://developers.tiktok.com/doc/display-api-get-started) requires Login Kit authorization with `user.info.basic,video.list` scopes, so the club itself would have to log in to the app. The [Research API](https://developers.tiktok.com/products/research-api/) is limited to academic and not-for-profit research bodies that are "independent of commercial interests".

### Facebook

- `https://www.facebook.com/LondonLions` returns 400 with a bare "Error" page for anonymous requests. `mbasic.facebook.com` returns 400 as well.
- The Page plugin `https://www.facebook.com/plugins/page.php?href=...&tabs=timeline` returns 200, but the HTML is a JavaScript shell with no post text. The timeline loads client-side.
- Graph API `https://graph.facebook.com/v21.0/LondonLions/posts` without a token returns 403 "Provide valid app ID".
- Official API: [Page Public Content Access](https://developers.facebook.com/docs/features-reference/page-public-content-access) is required to read posts from a Page you do not manage. It needs app review and is "only available with business verification". A live app without it "will not be able to see any Page public content".
- Bridges: RSS-Bridge's Facebook bridge fails with "Unable to get the page id" on public instances (see the Instagram section for the instance results).

## Programme value: last fortnight on YouTube

The 15 feed entries, 2026-10-12 to 2026-10-22, judged against the programme's needs:

| Date | Title | Programme value |
| --- | --- | --- |
| 2026-10-22 | LONDON LIONS VS TURK TELEKOM! RIVALRIES RENEWED?! | Preview for the next EuroCup fixture. Useful as a "watch" link. |
| 2026-10-21 | U-BT Cluj-Napoca vs London Lions LIVE, BKT EuroCup Round 4 | Full game replay. Useful as a "last game" link. |
| 2026-10-21 | LONDON LIONS HANDLE BUSINESS IN CLUJ MOVING TO 2-2 in EUROCUP | Highlights, result and standing in the title. High value. |
| 2026-10-21 | 3 EMOJIS, GUESS THE COUNTRY CHALLENGE! | Fun content. No value. |
| 2026-10-18 | LONDON LIONS EDGE CHESHIRE 87-83 TO EXTEND UNBEATEN SLB START | Highlights, score and form in the title. High value. |
| 2026-10-16 | London Lions vs Skyliners Frankfurt LIVE, BKT EuroCup Show | Full game replay with studio show. Useful link. |
| 2026-10-16 | EuroCup Post-game Press Conference | Coach comments. Medium value, needs transcription to quote. |
| 2026-10-15 | LONDON LIONS DROP TO DEFEAT AT HOME AGAINST SKYLINERS | Highlights with result. High value. |
| 2026-10-12 to 14 | Sponsor, NBA court visit, player skills clips (7 videos) | Hype and sponsor content. No value. |

About half the uploads carry a result or form note in the title, which makes the feed a reliable "highlights and last-game" source with no parsing beyond the title. It never carries injury or lineup news.

Injury and roster news for the Lions appears as articles on the club site, for example the "lions roster update" on Tarik Phillip and the Jono Komagum season-ending surgery note at `thelondonlions.com/news`. Those pages are covered by the fixture and club-site tickets, so losing X and Instagram loses little that matters to a programme.

## Recommendation for the programme

- **Highlights section**: pull the YouTube feed on game morning, take entries from the last seven days whose title contains the opponent name or a score, and link them. Source line: the feed URL.
- **Watch link**: the most recent entry titled with the next opponent, if any, as a preview link.
- **No social section for X, Instagram, TikTok or Facebook**. Revisit only if the club publishes an RSS or JSON feed of its own, or if X's pay-per-use pricing becomes acceptable (about $0.10 a month for one timeline read per game morning, but it needs a developer account and a card on file).

## Caveats

- One-day probe from one IP. X's 429 could be a per-IP block rather than a hard wall, but the endpoint is undocumented and has no uptime promise either way.
- No logged-in session was tried, by design. A session cookie from a dedicated account would open Instagram, X and Facebook, but it is against each platform's terms and breaks whenever the account is locked.
- Headless browsers were not tried. They would run TikTok's and Facebook's client-side loaders, but at the cost of bot checks and a Chromium dependency in a job that must run unattended at 08:00.
