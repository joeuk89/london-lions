# HTML to PDF rendering inside an automated job

Research for [issue #6](https://github.com/joeuk89/london-lions/issues/6), 22 October 2026.

## Question

What is the least fragile way to turn the programme web page into an A5 PDF inside the job that generates it? Candidates: headless Chromium via Playwright, WeasyPrint, wkhtmltopdf, a hosted converter with a free tier. The job runs in GitHub Actions or a Claude Code cloud scheduled task (formerly "routine").

## Recommendation

Use **headless Chromium through Playwright** (`chromium` with `--only-shell`). It renders the same engine that produces the web page, so the PDF matches what the page looks like, including any JavaScript-built sections. Install cost is one `npx playwright install --with-deps chromium --only-shell` in both environments, and both environments already allow the hosts it needs.

**WeasyPrint** is the fallback if the programme page stays pure static HTML and CSS. It is a lighter install, produces a PDF about a fifth of the size, and has better paged-media CSS. It does not run JavaScript, which the test below confirms.

Drop **wkhtmltopdf** (archived, its own site tells you to use WeasyPrint or Puppeteer instead) and the **hosted converters** (the free tiers are small, they add a network dependency and a secret, and they mostly run headless Chromium anyway).

## Test on a sample A5 programme

A sample page: A5 via `@page`, a Google web font (Inter), a coloured banner, three sections with `break-before: page`, and a standings table built with `document.write`. Rendered on macOS arm64 on 22 October 2026. Script and output live in the session scratchpad, not the repo.

| | Playwright 1.64.1 + Chromium headless shell | WeasyPrint 70.0 |
| --- | --- | --- |
| Page size | 420 x 595 pt (A5) | 419.5 x 595.3 pt (A5) |
| Pages | 4 | 4 |
| Web font | Rendered | Fetched over HTTP and embedded as subset (`Inter`, `Inter-Bold`) |
| Script-built standings table | Rendered | Empty (no JavaScript) |
| Output size | 77 KB | 14 KB |
| Wall time | 2.1 s including browser launch | 0.9 s |
| Install footprint | 18 MB npm package + 203 MB headless shell | 61 MB venv (plus system Pango) |
| Install time | 6 s browser download on a fast connection | about 10 s pip |

WeasyPrint warned `Ignored print-color-adjust: exact, unknown property`; it printed the background colour anyway.

## Candidate 1: Playwright + headless Chromium

**PDF support.** `page.pdf()` "generates a pdf of the page with `print` css media" and "by default ... generates a pdf with modified colors for printing. Use the `-webkit-print-color-adjust` property to force rendering of exact colors." Formats include A0 to A6; A5 is 5.83 x 8.27 in. `preferCSSPageSize` "defaults to `false`, which will scale the content to fit the paper size", so set it to `true` if the page declares `@page { size: A5 }`. `printBackground` defaults to `false`. `tagged` and `outline` default to `false`. Margins default to none. ([Playwright `page.pdf()` docs](https://playwright.dev/docs/api/class-page#page-pdf))

PDF generation is Chromium-only. The docs do not say so on the method itself; a [playwright-python issue](https://github.com/microsoft/playwright-python/issues/2909) shows the runtime error on WebKit and notes the restriction is undocumented.

**Print CSS in Chromium** (from [MDN browser-compat-data for `@page`](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/page.json)): `@page` since Chrome 2, `size` descriptor since Chrome 15, `page-orientation` since 85, margin boxes such as `@top-center` since 131. `break-before`, `break-after` and `break-inside` are standard.

**Fonts.** Playwright has no `waitForFonts` option (Puppeteer does, defaulting to `true`; see [Puppeteer PDFOptions](https://pptr.dev/api/puppeteer.pdfoptions)). Await `document.fonts.ready` in `page.evaluate` before `page.pdf()`, as the test did. The `--with-deps` install on Ubuntu 24.04 pulls 21 libraries (libnss3, libpango-1.0-0, libcairo2, libgbm1 and so on) and the `tools` list adds `fonts-liberation`, `fonts-noto-color-emoji`, `fonts-freefont-ttf` and others ([nativeDeps.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/nativeDeps.ts)).

**Install.** Playwright "ships a regular Chromium build for headed operations and a separate chromium headless shell for headless mode." For headless-only CI "you can avoid downloading the full Chromium browser by passing `--only-shell`." Browser binaries download from Microsoft's CDN; the mirrors in source are `cdn.playwright.dev` and `playwright.download.prss.microsoft.com` ([registry/index.ts](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/index.ts)). Supported on "Ubuntu 22.04 / 24.04 / 26.04 (x86-64 or arm64)" with Node "22.x, 24.x or 26.x" ([system requirements](https://playwright.dev/docs/intro)). Latest release v1.64.1, 14 October 2026 ([releases](https://github.com/microsoft/playwright/releases/latest)).

**GitHub Actions.** The documented workflow is `npm ci` then `npx playwright install --with-deps` on `ubuntu-latest`, or run the job in the `mcr.microsoft.com/playwright:v1.64.0-noble` container with no browser install step. "Caching browser binaries is not recommended" because restoring the cache takes about as long as downloading, and OS dependencies cannot be cached. ([Playwright CI docs](https://playwright.dev/docs/ci#github-actions)) The `ubuntu-24.04` runner image already ships Google Chrome 155 and Chromium 155 ([runner image readme](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)), so `channel: 'chrome'` skips the download entirely at the cost of tracking whatever Chrome version the runner has.

**Claude Code cloud scheduled task.** Each run is "a fresh virtual machine (VM) running Ubuntu 24.04 on x86_64" with Node 20, 21 and 22, Python 3.x and `chromedriver` pre-installed; Chromium and Playwright are not listed. A setup script "runs as root on Ubuntu 24.04, so `apt install` and most language package managers work", must finish within roughly five minutes to be cached, and the cache is a filesystem snapshot that is reused for about seven days. The default Trusted network allowlist includes `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `archive.ubuntu.com`, `security.ubuntu.com`, `mcr.microsoft.com`, `*.data.mcr.microsoft.com`, `fonts.googleapis.com` and `fonts.gstatic.com`. It does not list `cdn.playwright.dev` or `playwright.download.prss.microsoft.com`, so the browser download needs either a Custom allowlist with those two hosts, or `apt install chromium` from the Ubuntu archive with `executablePath` pointed at it. VM limits are about 4 vCPU, 16 GB RAM, 30 GB disk. ([Cloud environments docs](https://code.claude.com/docs/en/cloud-environments), [scheduled tasks docs](https://code.claude.com/docs/en/routines))

## Candidate 2: WeasyPrint

**What it is.** A Python library: "WeasyPrint supports many of the CSS specifications written by the W3C." `HTML(...)` takes a filename, URL, file object or string; `write_pdf()` returns bytes or writes to a target. It "can read normal files, HTTP, FTP and data URIs" but "cookies and authentication are currently not supported." ([API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html))

**Print CSS.** Page `size`, `bleed` and `marks` are supported via `@page`; the docs' example is `@page { size: A3 landscape; margin: 3cm; }`. `break-before`, `break-after` and `break-inside` work for pages. `@font-face` is supported; "WeasyPrint should support the major font formats handled by HarfBuzz", and "subsetting is done with hb-subset when available on the system, or by the slower fontTools library as a fallback." Flexbox "works for simple use cases but is not deeply tested." Grid is supported since 62.0 with gaps: `inline-grid`, subgrid, `repeat(auto-fill)` and baseline alignment. Not supported: `min-content`/`max-content`/`fit-content()`, `overflow-x/y`, `writing-mode`, `text-shadow`, `color-mix()`, 3D transforms. ([API reference, "Unsupported features"](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html), [common use cases](https://doc.courtbouillon.org/weasyprint/stable/common_use_cases.html))

No JavaScript. The docs never mention script execution; the test above shows a script-built table coming out empty.

**Install.** Version 70.0, released 8 September 2026, needs Python 3.10+ and Pango 1.44+. Ubuntu 20.04+: `apt install python3-pip libpango-1.0-0 libharfbuzz0b libpangoft2-1.0-0 libharfbuzz-subset0` then `pip install weasyprint`, or `apt install weasyprint` for the distro package. "Following the standard way to install fonts on your system should be enough." ([First steps](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html), [changelog](https://doc.courtbouillon.org/weasyprint/stable/changelog.html)) Both GitHub Actions and the cloud VM allow `pypi.org`, `files.pythonhosted.org` and the Ubuntu archive, so the install works unchanged in either.

**Output tuning.** `optimize_images` makes "smaller images with no quality penalty, but the rendering time may be slightly increased"; `jpeg_quality` and `dpi` cap image size; "Tables are known to be slow, especially when they are rendered on multiple pages." ([Common use cases](https://doc.courtbouillon.org/weasyprint/stable/common_use_cases.html))

## Candidate 3: wkhtmltopdf

The GitHub repository "was archived by the owner on Jan 2, 2023. It is now read-only." ([wkhtmltopdf/wkhtmltopdf](https://github.com/wkhtmltopdf/wkhtmltopdf)) The last packaged build is 0.12.6.1 r3 from May 2023, with Debian bookworm `.deb` files and no Ubuntu 24.04 build ([packaging releases](https://github.com/wkhtmltopdf/packaging/releases)). The project status page says QtWebKit was deprecated in 2015 and removed in 2016, warns "Do not use wkhtmltopdf with any untrusted HTML", and for report generation from HTML you control says to "consider WeasyPrint or the commercial Prince tool", or Puppeteer for pages that rely on JavaScript ([status page](https://wkhtmltopdf.org/status.html)). Modern CSS such as flexbox and grid is unavailable in that engine. Rejected.

## Candidate 4: hosted converters

| Service | Free tier | Source |
| --- | --- | --- |
| PDFShift | 50 credits a month, no card; 15 MB max file, 30 s timeout | [pricing](https://pdfshift.io/pricing) |
| Browserless | 1,000 units a month, 2 concurrent browsers, 2 minute max session | [pricing](https://www.browserless.io/pricing) |
| Api2Pdf | One month free credit, then $1 a month minimum plus usage; no refunds | [pricing](https://www.api2pdf.com/pricing/) |

Enough volume for one programme per fixture, but each adds an API key to store as a secret, an outbound host to allowlist in the cloud environment, and a third party that can change terms or go down on a game morning. They render with headless Chromium themselves, so the output is no better than running Chromium in the job. Rejected unless the job cannot install a browser at all.

## Decision rule

- If the programme page uses JavaScript for any content, or you want the PDF to match the browser rendering exactly: Playwright with `format: 'A5'`, `preferCSSPageSize: true`, `printBackground: true`, and await `document.fonts.ready` first.
- If the page is static HTML and CSS and you want the smallest install and output: WeasyPrint with `@page { size: A5 }`.
- Either way, keep `@page`, `break-*` and `print-color-adjust` rules in the page's own stylesheet so the PDF and the web page share one source.
