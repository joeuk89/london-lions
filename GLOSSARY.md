# London Lions matchday

Keeps a supporter's calendar in step with the London Lions men's fixtures and produces a matchday programme on the morning of each game.

## Language

**Fixture**:
One scheduled game involving the Lions men's team, in any competition. A fixture can be added, moved, or cancelled during the season.
_Avoid_: Match, event, game (in code and docs; "game" is fine in prose)

**Competition**:
The tournament a fixture belongs to: SLB Championship, SLB Cup, SLB Trophy, SLB Play-offs, or EuroCup.
_Avoid_: League, tournament

**Feed**:
A subscribable calendar containing fixtures. Three feeds exist: all, home, and away.
_Avoid_: Calendar, ICS, export

**Home venue**:
The arena the Lions normally play home fixtures at: the Copper Box Arena.
_Avoid_: Usual venue, default venue

**Home fixture**:
A fixture where the Lions are the designated home side, or that is played in London. A neutral-venue final in London is both a home and an away fixture.
_Avoid_: Home game

**Away fixture**:
A fixture where the Lions are the designated away side, or that is played outside London.
_Avoid_: Away game, road game

**Neutral venue**:
An arena that is nobody's home venue, used for cup and play-off finals.

**Venue change**:
A home fixture played somewhere other than the home venue. Flagged upfront in the programme and in the game-morning email.
_Avoid_: Alternate venue, relocation

**Venue table**:
The hand-kept list of arenas with their address and whether they are in London. A fixture at an arena missing from the table is classified by designation alone until someone adds it.

**Withdrawn**:
The status of a fixture that its competition's source has dropped or marked cancelled, with no replacement date yet. A withdrawn fixture stays in the feeds marked as cancelled and is reinstated if it reappears.
_Avoid_: Cancelled, postponed (as states; both are "withdrawn")

**Sync**:
The daily run that reads every fixture source, updates the stored fixtures and rewrites the feeds.
_Avoid_: Scrape, import, refresh

**Programme run**:
The game-morning job that gathers sources, writes the programme, renders the PDF and emails the recipients.
_Avoid_: Programme job, matchday job

**Change notice**:
The list of fixture changes and warnings one sync produced. Empty when nothing changed. Every notification channel renders from it.
_Avoid_: Diff, report

**Source disagreement**:
A fixture on which the club page and the competition's source differ. Reported in the change notice; the competition's source wins.

**Override**:
A hand-written correction to one fixture that wins over every source, used when all sources are wrong.
_Avoid_: Patch, fix-up

**Programme**:
The matchday document for one fixture. One web page, read in the programme app and also rendered to a PDF. Contains only sections that have something to say.
_Avoid_: Program, preview, matchday guide

**Programme app**:
The installable web app on a recipient's phone that lists the season and keeps every programme readable offline.
_Avoid_: PWA, site, the app

**Season index**:
The front page of the programme app: every fixture of the season with its programme, result or tip-off time, next fixture first.
_Avoid_: Home page, schedule, fixture list

**Game morning**:
08:00 UK time on the date of a fixture. The moment the programme is produced and emailed.
_Avoid_: Matchday morning

**Source**:
A published page or feed a programme claim traces back to. Every claim in a programme has one; every programme lists its sources in one grouped list.
_Avoid_: Reference, citation

**Source bundle**:
Everything gathered for one programme: each source's text with its publisher, address and dates, plus the computed numbers (form, averages, tables, head to head, streaks). The programme is written from the bundle and nothing else.
_Avoid_: Context, scrape, inputs

**Freshness window**:
How far back a section looks for material. Anything older is left out of the bundle. News runs from the previous fixture, no shorter than a week and no longer than three; highlights a week; form the last five fixtures.
_Avoid_: Recency, cutoff

**Opponents table**:
The hand-kept list of clubs the Lions play: names and aliases, where the league source knows them, and where each club publishes news. A club missing from the table still gets roster and form from the league source but no news section.
_Avoid_: Club list, teams config

**Mandatory section**:
A programme section built from structural data that is never omitted: cover, comparison table, form and results, Lions roster, the opposition, head to head, what's next. If its data is missing the programme run fails rather than printing a gap.

**Omitted section**:
A section left out of a programme because its slice of the bundle was empty after the freshness window, or because nothing in it was worth saying. Recorded with its reason; never padded.
_Avoid_: Empty section, skipped section

**Recipient**:
A person who receives the game-morning email. Configured as a list; Joe first, then his brother.
_Avoid_: Subscriber, user
