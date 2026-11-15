import type { DayUsage } from '@modules/app-limiter';

import { WEEKDAYS } from './rules';

/** 'YYYY-MM-DD' moved by whole days (UTC maths, so daylight saving can't skip or repeat a day). */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function weekdayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

export interface DayTotal {
  day: string;
  label: string;
  totalMs: number;
}

/** Total time per day for the `count` days ending today; days without records count as 0. */
export function lastDays(history: DayUsage[], today: string, count: number): DayTotal[] {
  const byDay = new Map(history.map((h) => [h.day, h.usage]));
  return Array.from({ length: count }, (_, i) => {
    const day = shiftDay(today, i - (count - 1));
    const totalMs = Object.values(byDay.get(day) ?? {}).reduce((a, b) => a + b, 0);
    return { day, label: weekdayLabel(day), totalMs };
  });
}

/** Apps by time used, longest first; apps with no time are left out. */
export function appTotals(usage: Record<string, number>): { packageName: string; ms: number }[] {
  return Object.entries(usage)
    .filter(([, ms]) => ms > 0)
    .map(([packageName, ms]) => ({ packageName, ms }))
    .sort((a, b) => b.ms - a.ms || a.packageName.localeCompare(b.packageName));
}
