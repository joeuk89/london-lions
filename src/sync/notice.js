import { CHANGE_KINDS } from './reconcile.js';

const KIND_TITLES = {
  added: 'Added',
  tipoff_moved: 'Tip-off moved',
  venue_changed: 'Venue changed',
  status_changed: 'Withdrawn or reinstated',
  home_away_flipped: 'Home/away flipped',
};

const KIND_WORDS = {
  added: 'added',
  tipoff_moved: 'moved',
  venue_changed: 'venue changed',
  status_changed: 'withdrawn/reinstated',
  home_away_flipped: 'home/away flipped',
};

export function createNotice(now) {
  const notice = { run_at: now.toISOString(), changes: [], warnings: [], info: [] };
  return {
    notice,
    change(kind, fixture, text) {
      notice.changes.push({ kind, fixture_id: fixture.id, text });
    },
    warn(kind, text) {
      notice.warnings.push({ kind, text });
    },
    info(text) {
      notice.info.push(text);
    },
  };
}

export function isEmpty(notice) {
  return notice.changes.length === 0 && notice.warnings.length === 0;
}

export function subject(notice) {
  const counts = CHANGE_KINDS
    .map((kind) => [kind, notice.changes.filter((c) => c.kind === kind).length])
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${KIND_WORDS[kind]}`);
  if (counts.length === 0) return `Lions fixtures: ${notice.warnings.length} warning${notice.warnings.length === 1 ? '' : 's'}`;
  return `Lions fixtures: ${counts.join(', ')}`;
}

export function body(notice) {
  const out = [];
  for (const kind of CHANGE_KINDS) {
    const items = notice.changes.filter((c) => c.kind === kind);
    if (items.length === 0) continue;
    out.push(`${KIND_TITLES[kind]} (${items.length})`);
    for (const c of items) out.push(`  ${c.text}`);
    out.push('');
  }
  if (notice.warnings.length > 0) {
    out.push(`Warnings (${notice.warnings.length})`);
    for (const w of notice.warnings) out.push(`  [${w.kind}] ${w.text}`);
    out.push('');
  }
  if (notice.info.length > 0) {
    out.push('Active overrides');
    for (const line of notice.info) out.push(`  ${line}`);
    out.push('');
  }
  out.push(`Sync ran at ${notice.run_at}.`);
  return out.join('\n') + '\n';
}
