import type { Rule } from '@modules/app-limiter';

import {
  applySchedule,
  inBedtime,
  remainingMs,
  scheduleKind,
  scheduleSummary,
  usedMs,
  validatePassword,
  validateRule,
  weekdayIndex,
} from '../rules';

const MIN = 60_000;
const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: 'r1',
  name: 'Social',
  packages: ['tiktok', 'insta'],
  minutesByDay: [30, 30, 30, 30, 30, 60, 60],
  enabled: true,
  ...patch,
});

describe('allowance', () => {
  it('starts the week on Monday', () => {
    expect(weekdayIndex(new Date(2026, 10, 16))).toBe(0);
    expect(weekdayIndex(new Date(2026, 10, 22))).toBe(6);
  });
  it('shares one allowance between the apps of a group and adds granted time', () => {
    const usage = { tiktok: 20 * MIN, insta: 15 * MIN, other: 99 * MIN };
    expect(usedMs(rule(), usage)).toBe(35 * MIN);
    expect(remainingMs(rule(), 0, usage, {})).toBe(-5 * MIN);
    expect(remainingMs(rule(), 0, usage, { r1: 15 * MIN })).toBe(10 * MIN);
    expect(remainingMs(rule(), 5, usage, {})).toBe(25 * MIN);
  });
});

describe('inBedtime', () => {
  it('handles a window across midnight', () => {
    const night = { enabled: true, startMinute: 21 * 60, endMinute: 7 * 60 };
    expect(inBedtime(night, 23 * 60)).toBe(true);
    expect(inBedtime(night, 6 * 60)).toBe(true);
    expect(inBedtime(night, 7 * 60)).toBe(false);
    expect(inBedtime({ ...night, enabled: false }, 23 * 60)).toBe(false);
  });
});

describe('schedule', () => {
  it('recognises the kind', () => {
    expect(scheduleKind(Array(7).fill(20))).toBe('daily');
    expect(scheduleKind([20, 20, 20, 20, 20, 60, 60])).toBe('weekdays');
    expect(scheduleKind([20, 20, 30, 20, 20, 60, 60])).toBe('custom');
  });
  it('simplifies when switching kind', () => {
    expect(applySchedule('daily', [20, 25, 30, 20, 20, 60, 90])).toEqual(Array(7).fill(20));
    expect(applySchedule('weekdays', [20, 25, 30, 20, 20, 60, 90])).toEqual([20, 20, 20, 20, 20, 60, 60]);
  });
  it('summarises', () => {
    expect(scheduleSummary(Array(7).fill(20))).toBe('20 min a day');
    expect(scheduleSummary(Array(7).fill(0))).toBe('Blocked every day');
    expect(scheduleSummary([0, 0, 0, 0, 0, 90, 90])).toBe('blocked on weekdays · 1 h 30 min on weekends');
    expect(scheduleSummary([1, 2, 3, 4, 5, 6, 7])).toBe('Different every day');
  });
});

describe('validation', () => {
  it('checks rules', () => {
    expect(validateRule(rule())).toBeNull();
    expect(validateRule(rule({ packages: [] }))).toMatch(/at least one app/);
    expect(validateRule(rule({ name: ' ' }))).toMatch(/name/);
    expect(validateRule(rule({ name: '', packages: ['yt'] }))).toBeNull();
    expect(validateRule(rule({ minutesByDay: [1, 2, 3] }))).toMatch(/Minutes/);
  });
  it('checks passwords', () => {
    expect(validatePassword('abc', 'abc')).toMatch(/4 characters/);
    expect(validatePassword('abcd', 'abce')).toMatch(/do not match/);
    expect(validatePassword('abcd', 'abcd')).toBeNull();
  });
});
