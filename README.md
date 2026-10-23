# London Lions matchday

Keeps a supporter's calendar in step with the London Lions men's fixtures, and writes a matchday programme on the morning of each game. It covers every competition: SLB Championship, Cup, Trophy, Play-offs and EuroCup.

Site: <https://joeuk89.github.io/london-lions/>

## Use it

### Subscribe to the fixtures

Add one of these URLs to your calendar app as a subscription, not a one-off import, so changes keep arriving:

| Feed | URL |
| --- | --- |
| All fixtures | `https://joeuk89.github.io/london-lions/feeds/all.ics` |
| Home fixtures | `https://joeuk89.github.io/london-lions/feeds/home.ics` |
| Away fixtures | `https://joeuk89.github.io/london-lions/feeds/away.ics` |

If a game is moved, rescheduled or cancelled, your existing event updates in place. A neutral-venue final in London shows up in both the home and away feeds.

### Read the programme

On game morning a programme goes up on the site as a web page and an A5 PDF. It covers form, both rosters with season averages, head to head, the league table, club news and what's next. The season page links every programme so far.

To keep programmes readable offline, install the site as an app. Follow the steps at [`/install/`](https://joeuk89.github.io/london-lions/install/). Open the app once on game day and that programme stays saved for the rest of the season.

## How it works

Two scheduled GitHub Actions workflows do everything, and commit what they produce straight to `main`. GitHub Pages serves the repo root, so there is no separate deploy, and the repo doubles as the season archive.

**Fixture sync** (`.github/workflows/sync.yml`, 07:00 UK daily) reads the fixture lists from Genius Sports (SLB competitions) and the EuroLeague API (EuroCup). It merges them into `data/fixtures.json` and checks them against the club's schedule page. Then it rewrites the three feeds and the season page, and emails a summary of what changed.

**Programme run** (`.github/workflows/programme.yml`, 08:00 UK on game days) works in four stages:

1. A gather step fetches league data and news for the fixture and works out every number. It saves the result as a source bundle.
2. Claude writes the prose from that bundle alone, with no web access. Every paragraph must cite a source in the bundle.
3. A renderer builds the page and PDF. It fails the run if any paragraph cites nothing or breaks the content model.
4. The programme is committed and emailed. If any step fails, a "no programme today" email names the step instead.

The design decisions behind this are in [`docs/adr/`](docs/adr/). The programme's structure and the rules the renderer enforces are in [`docs/programme-content.md`](docs/programme-content.md). [`GLOSSARY.md`](GLOSSARY.md) defines the terms the code uses.

## Develop

You need Node 22 or later. There is no build step.

```sh
npm ci
npm test                                   # run every test
node --test test/reconcile.test.js         # run one test file
npm run sync -- --dry-run                  # fetch live sources and print what would change, writing nothing
```

To render a programme locally from the worked example (needs Chrome installed for the PDF):

```sh
npm run programme -- test/fixtures/programme/bristol.json test/fixtures/programme/bristol.md out/bristol
```

To check a programme's Markdown without rendering the PDF:

```sh
node src/programme/check.js <data.json> <programme.md>
```

### Configuration

Everything season-specific lives in `config/`:

| File | Holds |
| --- | --- |
| `competitions.json` | Each competition and the source its fixtures come from |
| `opponents.json` | Each opponent's name, Genius team id and news feed |
| `venues.json` | Each venue's name, address and whether it is in London, keyed by source venue id |
| `overrides.json` | Manual corrections to individual fixtures, by fixture id |
| `programme.json` | News sources and settings for the programme run |

### Secrets

The workflows need these repository secrets:

| Secret | Used for |
| --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude writing the programme |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sending email over Gmail SMTP |
| `MAIL_TO` | Who the emails go to |

### Before each season

- Update `config/competitions.json` with the new season's competition and team ids.
- Re-enable both workflows in the Actions tab if they have been off. GitHub switches off scheduled workflows after 60 days without a commit.

## Issues

Bugs and feature requests go in [GitHub Issues](https://github.com/joeuk89/london-lions/issues).
