import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function loadConfig(dir = path.join(ROOT, 'config')) {
  const [competitions, venues, opponents, overrides] = await Promise.all([
    readJson(path.join(dir, 'competitions.json')),
    readJson(path.join(dir, 'venues.json')),
    readJson(path.join(dir, 'opponents.json')),
    readJson(path.join(dir, 'overrides.json')),
  ]);
  return { competitions, venues, opponents, overrides };
}

const normalise = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const slug = (s) => normalise(s).replace(/ /g, '-') || 'unknown';

export function resolveOpponent(opponents, ref) {
  const byId = opponents.find((o) =>
    (ref.genius_team_id && o.genius_team_id === ref.genius_team_id) ||
    (ref.euroleague_code && o.euroleague_code === ref.euroleague_code));
  if (byId) return { key: byId.key, name: byId.name, known: true };
  const wanted = normalise(ref.name ?? '');
  const byName = wanted && opponents.find((o) => [o.name, ...(o.aliases ?? [])].some((n) => normalise(n) === wanted));
  if (byName) return { key: byName.key, name: byName.name, known: true };
  return { key: slug(ref.name ?? ''), name: ref.name ?? 'Unknown', known: false };
}

export function resolveVenue(venues, sourceVenue) {
  if (!sourceVenue) return null;
  const known = venues[sourceVenue.key];
  if (known) {
    return { key: sourceVenue.key, name: known.name, address: known.address ?? null, in_london: known.in_london, home_venue: Boolean(known.home_venue), known: true };
  }
  return { key: sourceVenue.key, name: sourceVenue.name, address: sourceVenue.address ?? null, in_london: null, home_venue: false, known: false };
}

export function venueKeyByName(venues, name) {
  const wanted = normalise(name ?? '');
  if (!wanted) return null;
  return Object.entries(venues).find(([, v]) => [v.name, ...(v.aliases ?? [])].some((n) => normalise(n) === wanted))?.[0] ?? null;
}

export function competitionForClubLabel(competitions, label) {
  return competitions.find((c) => (c.club_labels ?? []).some((l) => normalise(l) === normalise(label))) ?? null;
}
