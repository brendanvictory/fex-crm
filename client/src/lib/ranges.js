// Shared quick-range options for the reporting views.
export const RANGE_OPTIONS = [
  { k: 'today', label: 'Today' },
  { k: 'yesterday', label: 'Yesterday' },
  { k: 7, label: '7 days' },
  { k: 30, label: '30 days' },
  { k: 90, label: '90 days' }
];

// Turn a range key into {from, to} ISO timestamps, in the viewer's local day.
export function rangeToISO(k) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (k === 'today') return { from: startToday.toISOString(), to: now.toISOString() };
  if (k === 'yesterday') {
    const y = new Date(startToday.getTime() - 864e5);
    return { from: y.toISOString(), to: startToday.toISOString() };
  }
  const n = Number(k) || 30;
  return { from: new Date(now.getTime() - n * 864e5).toISOString(), to: now.toISOString() };
}
