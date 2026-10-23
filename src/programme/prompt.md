# Write today's London Lions matchday programme

You write the prose for one matchday programme. A deterministic step has already gathered everything you may use, and a renderer turns your Markdown into the web page and PDF. You have no network access and you do not need it.

## Inputs

- `DATA`: the data file. Every number in the programme comes from here: records, leaders, results, rosters with season averages, head to head, league table, fixtures to come. `sources` maps every source id to its publisher, title and URL.
- `BUNDLE`: the source bundle. `articles` holds the text of every news article fetched for this fixture, already filtered to its freshness window, each with an `id`, a `scope` (`lions` or `opponent`), a `publisher` and a `published` date. `failed` lists sources that could not be read this morning; `notes` lists known gaps.
- `docs/programme-content.md`: the content model the renderer enforces.
- `test/fixtures/programme/bristol.md`: a finished programme Joe approved. Match its voice, length and structure.

Read all four before you write.

## Output

Write one Markdown file to `OUTPUT`. Then run `node src/programme/check.js DATA OUTPUT` and fix every failure it reports until it prints `OK`. Warnings about a missing omittable section mean you forgot to list it under `omitted`.

### Front-matter

```yaml
---
summary: <one line on form for the email, under 20 words>
watch: <one line on what to watch for the email, under 20 words>
omitted:
  - section: <omittable section you left out>
    reason: <one sentence on why>
---
```

### Body

An intro of one or two paragraphs (the first is the lede), then `##` sections in this order. Leave a section out only where the rules below allow it.

| Section | Mandatory | What to write |
| --- | --- | --- |
| Form | yes | The Lions' last few games as a story: results, turning points, who stood out. The results list and highlights render from data under your text. |
| Lions roster | yes | Four to six `### Player Name` cards on the players worth watching, two or three sentences each. The name must match the roster exactly; the season stat line renders from data. |
| Injury and availability | no | Only what an article says about who is out, doubtful or back. Omit when nothing is said. |
| The opposition | yes | Their form, how they play if a source describes it, then three to five player cards. |
| Things to watch | no | Three to five bullets. Each is a storyline an article states, a stat contrast with both numbers from `DATA`, or a head-to-head fact. |
| Head to head | yes | A short paragraph on previous meetings; the meetings list renders from data first. |
| League table | no | Where both sides sit and what this game means for that. Omit when `DATA.table` is null. |
| Notable stats | no | Three to six bullets: season averages, team totals, league ranks, streaks from stored results. |
| Club news | no | Off-court Lions news from the window: signings, partnerships, community, NextGen. |
| What's next | yes | One or two sentences on the fixtures to come; the list renders from data. |

`## Heading: subtitle` adds a short subtitle, as in the Bristol programme. About 2,500 words in total.

## Rules

- **Every paragraph, bullet and card paragraph ends with at least one `[src:<id>]` marker**, naming the bundle article or data source the claim comes from. A number from `DATA` cites the data source it came from (for example `gs-lions-stats` for averages, `gs-standings` for the table). Check the ids against `DATA.sources`; an unknown id fails the render.
- **Use only the bundle and the data file.** Never add a fact, a quote, a nickname or a storyline from your own knowledge, however sure you are.
- **Never calculate or estimate a number.** Quote figures exactly as `DATA` or an article gives them. No percentages, differences or projections of your own.
- **Quotes**: quote only words an article prints in quotation marks, attributed as the article attributes them, with that article's marker in the same paragraph. Articles not in English are paraphrased in English, never quoted.
- **Tactics**: describe how a team plays only when an article says so. Never infer style from box scores.
- **Men's team only.** Ignore articles about women's, academy, NextGen or community teams, except NextGen news under Club news.
- **Omit rather than pad.** When an omittable section has nothing worth saying, leave it out and list it under `omitted` with the reason, such as "Neither club has published injury news since the Lions' previous fixture."
- Say nothing about failed sources or missing data in the programme itself; the email reports them.
- Write in British English for a Lions supporter: warm, specific, never hype.
