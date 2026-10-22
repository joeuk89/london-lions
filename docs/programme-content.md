# Programme content model

The programme template renders one programme from two files:

```
npm run programme -- <data.json> <programme.md> <out-dir>
```

It writes `index.html` and `programme.pdf` (A5) to the output directory. The page links `assets/programme.css` and the self-hosted fonts in `assets/fonts/` by a relative path. `test/fixtures/programme/bristol.json` and `bristol.md` are a complete worked example.

## Data file (from the gather step)

Every number and every structured block comes from here. Claude never writes these.

| Key | Holds | Renders as |
| --- | --- | --- |
| `fixture` | The stored fixture (as in `data/fixtures.json`) plus `competition_name`, and an optional `venue.directions` from the venue table | Cover; venue-change flag with a Google Maps link when `venue_change` is true |
| `lions`, `opponent` | `name`, `record` (`position` optional, `won`, `lost`), `leaders` (`points`, `rebounds`, `assists`, `steals` as `{name, value}`; `threes` as `{name, made, attempted}`), `results` newest first, `highlights`, `roster` (each player may carry `season`: `pts`, `reb`, `ast`, `min`) | Comparison table, form, highlights, rosters, player-card stat lines |
| `head_to_head` | `scope` (`this-season` or `last-season`), `meetings` newest first, optional `overall` | Head to head and the comparison table's last meeting |
| `table` | `rows` of `team`, `played`, `won`, `lost`, `points`, or `null` when the competition has no table | League table |
| `next` | Upcoming fixtures with `tipoff`, `competition_name`, `opponent_name`, `home`, `venue_name`, `venue_change` | What's next |
| `sources` | Every bundle source by id: `publisher`, `title`, `url`, optional `published` | Sources list, grouped by publisher |
| `data_sources` | Ids of the sources the structured blocks came from | Added to the sources list |
| `gathered_at` | When the gather step ran | Last line of the sources list |

## Markdown file (from Claude)

- YAML front-matter, then an optional intro (the first paragraph is the lede), then `##` sections in the settled order: Form, Lions roster, Injury and availability, The opposition, Things to watch, Head to head, League table, Notable stats, Club news, What's next.
- `## Heading: subtitle` puts the subtitle in gold italic beside the heading. "The opposition" displays as the opponent's name.
- In Lions roster and The opposition, `### Player Name` starts a player card. The name must match that team's roster; the stat line comes from the player's `season`.
- Only paragraphs, bullet lists, bold, italic and links. Anything else fails the render.
- Every paragraph, list item and card paragraph carries at least one `[src:<id>]` marker that resolves in `sources`.
- `omitted` in the front-matter lists omittable sections left out, each with a `reason`. An omittable section that is neither written nor listed produces a warning.

## Rules the renderer enforces

The render fails when a mandatory section (form, Lions roster, the opposition, head to head, what's next) has no data, a section is unknown, repeated or out of order, a marker is missing or unresolved, a player card names someone off the roster, or a mandatory section is listed as omitted. The build warns when the PDF runs past 12 pages.
