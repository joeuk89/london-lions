export const UK = 'Europe/London';

const formatters = new Map();

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }));
  }
  return formatters.get(zone);
}

export function partsIn(zone, date) {
  const parts = {};
  for (const { type, value } of formatter(zone).formatToParts(date)) parts[type] = value;
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
  };
}

export function zonedToUtc(zone, { year, month, day, hour, minute }) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const p = partsIn(zone, new Date(guess));
    guess += wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

const pad = (n) => String(n).padStart(2, '0');

export function ukDate(date) {
  const p = partsIn(UK, date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function ukTime(date) {
  const p = partsIn(UK, date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function ukDateTime(date) {
  return `${ukDate(date)} ${ukTime(date)}`;
}

export function ukHour(date = new Date()) {
  return partsIn(UK, date).hour;
}

export function daysBetween(dateA, dateB) {
  return Math.abs(Date.UTC(...isoParts(dateA)) - Date.UTC(...isoParts(dateB))) / 86_400_000;
}

function isoParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

export function icsStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
