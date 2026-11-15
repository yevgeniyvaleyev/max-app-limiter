import type { DayUsage } from '@modules/app-limiter';

import { appTotals, lastDays, shiftDay, weekdayLabel } from '../stats';

describe('days', () => {
  it('shifts across months and years', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayLabel('2026-11-16')).toBe('Mon');
  });
});

describe('lastDays', () => {
  it('fills missing days and sums apps', () => {
    const history: DayUsage[] = [
      { day: '2026-11-13', usage: { a: 5, b: 7 } },
      { day: '2026-11-15', usage: { a: 3 } },
      { day: '2026-10-01', usage: { a: 999 } },
    ];
    expect(lastDays(history, '2026-11-15', 3)).toEqual([
      { day: '2026-11-13', label: 'Fri', totalMs: 12 },
      { day: '2026-11-14', label: 'Sat', totalMs: 0 },
      { day: '2026-11-15', label: 'Sun', totalMs: 3 },
    ]);
  });
});

describe('appTotals', () => {
  it('sorts by time and drops unused apps', () => {
    expect(appTotals({ a: 5, b: 0, c: 9 })).toEqual([
      { packageName: 'c', ms: 9 },
      { packageName: 'a', ms: 5 },
    ]);
  });
});
