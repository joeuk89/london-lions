import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import nodemailer from 'nodemailer';
import { programmePath, ukDate } from '../app/season.js';
import { ROOT } from '../sync/config.js';
import { escapeHtml as esc, parseProse } from './prose.js';

const format = (options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...options });
const clock = format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = format({ weekday: 'long', day: 'numeric', month: 'long' });

const IOS_NOTE = 'On iPhone, open the link in Safari rather than in Gmail’s own browser, so the programme saves to the app.';

const line = (value) => typeof value === 'string' && value.trim() !== '' && !value.includes('\n');

export function emailSummary(meta) {
  if (!line(meta?.summary)) throw new Error('Front-matter needs a one-line "summary" for the email');
  if (!line(meta?.watch)) throw new Error('Front-matter needs a one-line "watch" for the email');
  return { form: meta.summary.trim(), watch: meta.watch.trim() };
}

export const fixtureTitle = (f) => `Lions ${f.designated_home ? 'v' : 'at'} ${f.opponent_name}`;

export function failureLines(failed = []) {
  return [...new Set(failed.map((f) => f.label))].map((label) => `${label} unavailable this morning.`);
}

export function gameMorningEmail({ data, meta, failed, url }) {
  const f = data.fixture;
  const { form, watch } = emailSummary(meta);
  const tipoff = new Date(f.tipoff);
  const subject = `${f.venue_change ? 'Venue change: ' : ''}${fixtureTitle(f)}, ${f.competition_name}, ${clock.format(tipoff)}`;
  const summary = [
    [f.venue.name, f.venue.address].filter(Boolean).join(', '),
    `Tip-off ${clock.format(tipoff)}, ${day.format(tipoff)}`,
    form,
    watch,
  ];
  const footer = [IOS_NOTE, ...failureLines(failed)];
  const text = `${summary.join('\n')}\n\nOpen programme (saves it for offline): ${url}\n\nThe PDF is attached.\n\n${footer.join('\n')}\n`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff;font-family:Georgia,serif;color:#111111">
<div style="max-width:520px;margin:0 auto">
${summary.map((s) => `<p style="margin:0 0 8px;font-size:16px;line-height:1.45">${esc(s)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;background:#000000;color:#d4af37;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-weight:bold;border-radius:4px">Open programme (saves it for offline)</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#555555">The PDF is attached.</p>
${footer.map((s) => `<p style="margin:0 0 6px;font-size:13px;color:#777777">${esc(s)}</p>`).join('\n')}
</div></body></html>`;
  return { subject, text, html };
}

export function failureEmail({ fixture, step, runUrl }) {
  const what = fixture ? `: ${fixtureTitle(fixture)}` : '';
  return {
    subject: `No programme today${what}`,
    text: `The programme run failed at "${step}", so no programme went out this morning.\n\nRun log: ${runUrl}\n`,
  };
}

// OUTCOMES is "Step name=outcome;…" in step order; the first failure is the one to name.
export function failedStep(outcomes = '') {
  const pairs = outcomes.split(';').map((s) => s.split('=')).filter(([name]) => name);
  return pairs.find(([, outcome]) => outcome === 'failure')?.[0] ?? 'an unnamed step';
}

async function send(message) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !MAIL_TO) throw new Error('GMAIL_USER, GMAIL_APP_PASSWORD or MAIL_TO not set');
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  const result = await transport.sendMail({
    from: `London Lions programme <${GMAIL_USER}>`,
    to: MAIL_TO.split(',').map((s) => s.trim()).filter(Boolean),
    ...message,
  });
  console.log(`Sent ${result.messageId}: ${message.subject}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values: args, positionals: [kind] } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' },
      bundle: { type: 'string' },
      fixture: { type: 'string' },
      preview: { type: 'string' },
    },
  });
  const config = JSON.parse(await readFile(path.join(ROOT, 'config/programme.json'), 'utf8'));

  if (kind === 'programme') {
    const dir = path.resolve(args.dir);
    const data = JSON.parse(await readFile(path.join(dir, 'data.json'), 'utf8'));
    const { meta } = parseProse(await readFile(path.join(dir, 'programme.md'), 'utf8'));
    const { failed } = args.bundle ? JSON.parse(await readFile(args.bundle, 'utf8')) : { failed: [] };
    const url = new URL(programmePath(data.fixture), config.site_url).href;
    const message = gameMorningEmail({ data, meta, failed, url });
    const filename = `lions-${data.fixture.opponent}-${ukDate(data.fixture.tipoff)}.pdf`;
    if (args.preview) {
      await writeFile(args.preview, message.html);
      console.log(`Subject: ${message.subject}\n\n${message.text}`);
    } else {
      await send({ ...message, attachments: [{ filename, path: path.join(dir, 'programme.pdf') }] });
    }
  } else if (kind === 'failure') {
    let fixture = null;
    if (args.fixture) {
      const { fixtures } = JSON.parse(await readFile(path.join(ROOT, 'data/fixtures.json'), 'utf8'));
      fixture = fixtures.find((f) => f.id === args.fixture) ?? null;
    }
    const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, OUTCOMES } = process.env;
    const runUrl = `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
    await send(failureEmail({ fixture, step: failedStep(OUTCOMES), runUrl }));
  } else {
    console.error('Usage: node src/programme/email.js programme --dir <programme dir> [--bundle <bundle.json>] [--preview <file.html>]\n       node src/programme/email.js failure [--fixture <id>]');
    process.exit(2);
  }
}
