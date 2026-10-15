// Eastern-time date helpers so "per day" everywhere matches the agency's day.
const ET = 'America/New_York';
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' });

// A timestamp -> its Eastern calendar date, 'YYYY-MM-DD'.
export const etDate = (d) => ymdFmt.format(new Date(d));

// The day after a 'YYYY-MM-DD' string.
export function nextDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

// Ordered list of Eastern calendar dates covering [fromISO, toISO].
export function etDays(fromISO, toISO) {
  const out = [];
  let cur = etDate(fromISO);
  const end = etDate(toISO);
  let guard = 0;
  while (cur <= end && guard++ < 2000) { out.push(cur); cur = nextDay(cur); }
  return out;
}

// The UTC instant of Eastern midnight for a given 'YYYY-MM-DD'.
function zonedMidnightUTC(ymd) {
  const guess = new Date(ymd + 'T00:00:00Z');
  const asET = new Date(guess.toLocaleString('en-US', { timeZone: ET }));
  const asUTC = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() + (asUTC - asET));
}

// Start of the current Eastern day / month, as a UTC ISO string (for caps).
export function etDayStartUTC(now = new Date()) { return zonedMidnightUTC(etDate(now)).toISOString(); }
export function etMonthStartUTC(now = new Date()) { return zonedMidnightUTC(etDate(now).slice(0, 7) + '-01').toISOString(); }
