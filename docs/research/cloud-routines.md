# Claude Code cloud routines: what a scheduled run can and cannot do

Research for [issue #4](https://github.com/joeuk89/london-lions/issues/4). Question: can a scheduled Claude Code cloud routine (Anthropic now calls them "scheduled tasks") be the runtime for the 08:00 programme job, and how does it compare with a GitHub Actions job?

Researched 2026-10-22 against Anthropic's documentation. Routines are in research preview, so limits and behaviour may change.

## Short answer

A cloud routine can do the job, with two conditions.

1. The routine's cloud environment needs **Full** or **Custom** network access, because the Default environment's Trusted allowlist blocks the club, league and EuroLeague pages.
2. The run must be the **source gatherer and writer**, not the publisher. It pushes to a `claude/`-prefixed branch by default and can be told to push elsewhere, but any email sending, PDF rendering and Pages deploy are better left to a deterministic GitHub Actions workflow that reacts to the push.

The cost model is the deciding factor. Routines draw on Joe's Max subscription. A GitHub Actions job calling the Claude API needs either a pay-as-you-go API key or a subscription OAuth token from `claude setup-token`, and the second is the same subscription usage either way.

Recommended shape: a daily routine at 08:07 UK that decides "fixture today?", gathers sources, writes the programme content into the repo and pushes; then a GitHub Actions workflow on that push renders the PDF, deploys Pages and sends the email. Reasons follow.

## Findings

### Scheduling, precision and timezone

- Schedule triggers accept a preset (hourly, daily, weekly) or a custom 5-field cron. "Expressions that run more often than once per hour are rejected." [routines]
- Presets take the time "in your local time zone". [routines] Custom cron expressions are UTC: the `/schedule` CLI skill says "Cron expressions and `run_once_at` timestamps are always in UTC" and asks Claude to convert from Europe/London. [schedule-skill] So a cron written as `7 7 * * *` fires at 08:07 BST but 07:07 GMT after the October clock change. Either use the daily preset in local time, or write the cron for 07:07 UTC and accept the job running at 07:07 UK in winter, or re-save the cron twice a year.
- Precision: "if you schedule a run exactly on the hour, such as 9:00, it can start several minutes late. To start close to the scheduled time, pick a few minutes past the hour, for example 9:07." [routines]
- Scheduled runs are capped at 100 per hour per account; "Run now" and API fires at 30 per hour per task. Not relevant at one run a day. [routines]

### Where it runs and what is installed

- Each run "starts a fresh, isolated session" as a full Claude Code cloud session on an Anthropic-managed VM: Ubuntu 24.04 x86_64, about 4 vCPUs, 16 GB RAM, 30 GB disk. [cloud-env]
- Preinstalled: Python 3 with pip/uv, Node 20/21/22, PHP 8.3, Go, Rust, Java, Docker, PostgreSQL 16, Redis, git, gh, jq, ripgrep. `chromedriver` is listed under Node tools; a Chrome or Chromium browser binary is not. [cloud-env]
- A setup script runs as root before Claude starts and is cached as a filesystem snapshot when it finishes within about five minutes; the cache expires after about seven days or when the script or allowed hosts change. [cloud-env]
- Permission mode: runs start in auto mode, where a classifier allows or blocks actions. A run "still stops and waits for an answer" when an action matches an ask rule or repeated blocks hit the threshold. An unattended 08:00 job must avoid prompts, so the repo's `.claude/settings.json` should pre-allow the tools the job uses. [routines]

### Network access: can it fetch club and league pages?

- The Default environment uses **Trusted** access: only the [default allowlist](https://code.claude.com/docs/en/cloud-environments#default-allowed-domains) of package registries, GitHub, cloud SDKs and similar. Requests elsewhere "fail with `403` and `x-deny-reason: host_not_allowed`". [routines] The allowlist does not include thelondonlions.com, Genius Sports, Hoopsfix, the SLB site or the EuroLeague API.
- Fix: edit the environment's network access to **Custom** with the needed domains (optionally keeping the defaults), or **Full** for "Any domain". A new policy applies from the next run. [routines][cloud-env]
- All outbound traffic goes through Anthropic's security proxy, which adds "rate limiting and abuse prevention". Scrape targets will see Anthropic's egress IPs, not Joe's. [cloud-env]

### Secrets

- Environment variables are plain `.env` lines on the environment, readable by "anyone who uses the environment" and by any command Claude runs. [cloud-env]
- **Network secrets** are the safer option: a bearer token or custom header stored on the environment; Anthropic's agent proxy attaches it to requests to the hosts you list "after each request leaves the session's VM, so the key itself stays outside the VM". Hosts with a secret are reachable even if the network level would otherwise block them. Secrets cannot be edited, only deleted and re-added, and never attach to GitHub, api.anthropic.com or public package registries. [cloud-env]
- Implication for email: an SMTP password cannot be a network secret (it is not an HTTP header). An HTTP email API key (Resend, Postmark, SendGrid, Gmail API) can. Alternatively the Gmail connector is already attached to Joe's account and connector traffic "travels through Anthropic's servers" and needs no allowlist change. [routines][schedule-skill]

### Git: clone, commit, push

- "Each repository you add is cloned on every run. Claude starts from the repository's default branch unless your prompt specifies otherwise." [routines]
- "Claude pushes its work to a branch prefixed with `claude/` unless your prompt directs it to push to another branch." Branch protection rules or rulesets on GitHub are the way to control pushes; the proxy "doesn't limit which branches a push can update". [routines][cloud-env]
- Git credentials never enter the VM. A GitHub proxy swaps a scoped credential for Joe's real token server-side. Commits "carry your GitHub user". [routines][cloud-env]
- Restrictions through the proxy: no branch deletes, no tag pushes, no GitHub GraphQL. `gh pr` and `gh issue` use GraphQL and get a 403; use `gh api repos/{owner}/{repo}/...` REST calls instead. The proxy serves API requests only for repositories attached to the task. [cloud-env]
- GitHub connection: if it is "missing or expired when a run is due, the scheduled task skips runs until you reconnect, for up to 72 hours", then turns itself off. [routines]

### Runtime, token and usage limits

- No documented wall-clock limit on a run. Bash commands default to a 2-minute foreground timeout, extendable to 10 minutes, then move to the background for up to 30 more minutes; `BASH_DEFAULT_TIMEOUT_MS` on the environment raises both. [cloud-env]
- "Scheduled tasks draw down subscription usage the same way interactive sessions do." When the subscription limit is hit, "additional runs are rejected until your usage window resets" unless usage credits (metered overage) are turned on. A paused subscription puts tasks on hold. [routines]
- Auto-compaction runs when the context window fills; a long scrape-heavy run will compact mid-way. [web]

### Headless browser for PDF rendering

- Not documented. The VM lists `chromedriver` but no browser. Setup scripts run as root with `apt`, and `npx playwright install chromium` is the usual route, but Playwright's download CDN is not on the Trusted allowlist, so this needs the Custom or Full network level the job already needs for scraping. The result would be cached in the environment snapshot for about seven days. A test run is the only way to confirm Chromium launches inside the sandbox.
- Lower-risk alternative: render the PDF without a browser (WeasyPrint via pip, which is on the allowlist) or render it in GitHub Actions, where Playwright's Chromium is a one-liner and well trodden. This research recommends the second.

### What happens on failure

- No retry is documented. The run list shows green when "the session started and exited without an infrastructure error. It does not mean the work your prompt describes succeeded." Blocked network requests, missing connector tools and failures in the work "surface there rather than in the status indicator". [routines]
- No built-in notification. The prompt has to make failure loud itself: for example, open a GitHub issue through the REST proxy, or send an email through the connector or an HTTP API. `/schedule why did my nightly review do nothing` reads run logs after the fact. [routines]
- A run that stops on a permission prompt waits silently until someone opens it. [routines]
- Session creation can fail when a VM cannot be allocated; the docs say to retry after a minute, but a routine fire has nobody to retry it. [web]

### Alternative: GitHub Actions calling Claude directly

Two flavours exist.

**A. `anthropics/claude-code-action` on a `schedule` trigger.** The same Claude Code agent, but running on a GitHub-hosted runner.

- Auth: `ANTHROPIC_API_KEY` (pay per token) or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, and "if you authenticate with an OAuth token, runs use your Claude subscription instead of API billing". [gha] So the subscription constraint does not force the routine choice.
- Network: a GitHub runner has unrestricted egress, so club and league pages are reachable with no allowlist work.
- Secrets: ordinary GitHub Actions secrets, including SMTP passwords.
- Git: the runner's checkout plus the Claude GitHub App token; pushing to `main` and deploying Pages is standard.
- Browser: Playwright with Chromium installs in one step and is documented everywhere.
- Scheduling: UTC only, "can be delayed during periods of high loads", runs only from the default branch, and "in a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days". [gh-schedule][gha] The 60-day rule matters in the off-season; the 07:00 sync job's daily commits keep the repo active during the season.
- Failure: GitHub's own retry, timeout, concurrency and email-on-failure controls apply. [gha]
- Cost: GitHub Actions minutes are free for public repos.

**B. A plain script calling the Messages API.** Deterministic, cheapest to debug, but needs an API key (pay as you go, outside the Max subscription) and re-implements the gather-then-write loop that the agent does for free.

### Comparison

| Need | Cloud routine | GitHub Actions + claude-code-action |
| --- | --- | --- |
| Fetch club and league pages | Yes, after switching the environment off Trusted | Yes, no setup |
| Secrets | Env vars (readable) or network secrets (HTTP headers only); connectors for Gmail | GitHub secrets, any kind |
| Clone, commit, push | Yes; defaults to `claude/` branch; no `gh pr`/`gh issue`, REST only | Yes, standard |
| Subscription billing | Yes | Yes with OAuth token; API key otherwise |
| 08:00 UK precision | A few minutes late on the hour; UTC cron drifts at clock change unless preset used | UTC cron, drifts at clock change; delayed under load |
| Headless browser PDF | Undocumented; Chromium not preinstalled | Documented, routine |
| Failure signal | None built in; prompt must raise it | Workflow failure email, retries, timeouts |
| Permission prompts | Auto mode can stall waiting for a human | Tools pre-allowed with `--allowedTools`; no human in loop |
| Off-season | Keeps firing | Public-repo schedule disabled after 60 idle days |

### Recommendation for the programme job

Use a routine for the judgement work and Actions for the mechanical work, or use claude-code-action for both. Either way, the scraping, PDF rendering and email should not depend on undocumented sandbox behaviour. The decision ticket should pick between:

- **Routine writes, Actions publishes**: routine at 08:07 UK local preset, Custom network with the source domains, pushes programme content to a branch; a workflow on push renders PDF, deploys Pages, emails.
- **Actions does everything**: one scheduled workflow with claude-code-action and the OAuth token, Playwright for the PDF, SMTP or an email API from secrets. Simpler to observe; one place to look when it fails.

## Sources

- [routines] Anthropic, "Automate work with scheduled tasks": https://code.claude.com/docs/en/routines
- [cloud-env] Anthropic, "Configure cloud environments": https://code.claude.com/docs/en/cloud-environments
- [web] Anthropic, "Use Claude Code in the cloud": https://code.claude.com/docs/en/claude-code-on-the-web
- [compare] Anthropic, "Run prompts on a schedule", section "Compare scheduling options": https://code.claude.com/docs/en/scheduled-tasks
- [gha] Anthropic, "Claude Code GitHub Actions": https://code.claude.com/docs/en/github-actions
- [gh-schedule] GitHub, "Events that trigger workflows", section "schedule": https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows
- [schedule-skill] The bundled `/schedule` skill text in Claude Code (CLI, read 2026-10-22), which states the UTC cron rule, the one-hour minimum, and that routines "can only use claude.ai connectors".
