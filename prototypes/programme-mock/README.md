# Programme mock (prototype, throwaway)

Answers wayfinder ticket #9: what does a programme look and read like?

Open `index.html` in a browser. Three structurally different variants, switched with the floating bar, the arrow keys, or `?variant=A|B|C`:

- **A, Programme**: black cover page, then one reading column in the agreed section order. Sources listed under each section.
- **B, Briefing**: no cover; a four-cell fact strip, then short bullet sections. Sources as numbered endnotes.
- **C, Head to head**: a Lions-against-Flyers comparison table as the hero, then narrative. Sources in a side column on wide screens, a collapsed "Sources" line on a phone.

`?venue=changed` (or the "Venue change" button) shows the venue-change treatment: a gold flag on the cover and a directions line. It is a demo; the real game is at the Copper Box.

`programme-<variant>.pdf` are the A5 renders (`render.mjs`, Playwright driving the installed Chrome, `preferCSSPageSize`). `shot-*.png` are phone and desktop screenshots.

Content is hand-written from public sources read on 22 October 2026 for London Lions v Bristol Flyers, Saturday 24 October 2026. Every section lists its sources. No injury or availability section exists because neither club published anything: the section is omitted rather than padded.
