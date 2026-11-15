/**
 * "45 min", "1 h", "1 h 20 min". Remaining time rounds up (a running limit never reads "0 min"), used time
 * rounds down. Mirrors `Limits.formatDuration` in the native module.
 */
export function formatDuration(ms: number, round: 'up' | 'down' = 'up'): string {
  const exact = Math.max(0, ms) / 60_000;
  const minutes = round === 'up' ? Math.ceil(exact) : Math.floor(exact);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Minute of the day as "07:05". */
export function formatClock(minuteOfDay: number): string {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Whole minutes typed by the user, clamped to a day; anything unreadable is 0. */
export function parseMinutes(text: string): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? Math.min(n, 1440) : 0;
}
