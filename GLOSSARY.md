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
A published page or feed a programme claim traces back to. Every claim in a programme has one; every section lists its sources.
_Avoid_: Reference, citation

**Recipient**:
A person who receives the game-morning email. Configured as a list; Joe first, then his brother.
_Avoid_: Subscriber, user
