import type { Bedtime, Rule } from '@modules/app-limiter';

import { formatDuration } from './format';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** 0 = Monday … 6 = Sunday, like the native module. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function allowanceMs(rule: Rule, weekday: number): number {
  return Math.max(0, rule.minutesByDay[weekday] ?? 0) * 60_000;
}

export function usedMs(rule: Rule, usage: Record<string, number>): number {
  return rule.packages.reduce((sum, pkg) => sum + (usage[pkg] ?? 0), 0);
}

/** Today's allowance including time granted with the password. */
export function totalMs(rule: Rule, weekday: number, extra: Record<string, number>): number {
  return allowanceMs(rule, weekday) + (extra[rule.id] ?? 0);
}

export function remainingMs(
  rule: Rule,
  weekday: number,
  usage: Record<string, number>,
  extra: Record<string, number>,
): number {
  return totalMs(rule, weekday, extra) - usedMs(rule, usage);
}

export function inBedtime(bedtime: Bedtime, minuteOfDay: number): boolean {
  if (!bedtime.enabled || bedtime.startMinute === bedtime.endMinute) return false;
  return bedtime.startMinute < bedtime.endMinute
    ? minuteOfDay >= bedtime.startMinute && minuteOfDay < bedtime.endMinute
    : minuteOfDay >= bedtime.startMinute || minuteOfDay < bedtime.endMinute;
}

/** How the editor presents `minutesByDay`. */
export type ScheduleKind = 'daily' | 'weekdays' | 'custom';

export function scheduleKind(minutes: number[]): ScheduleKind {
  if (minutes.every((m) => m === minutes[0])) return 'daily';
  const weekdaysSame = minutes.slice(0, 5).every((m) => m === minutes[0]);
  return weekdaysSame && minutes[5] === minutes[6] ? 'weekdays' : 'custom';
}

/** Fits the minutes to a simpler schedule kind when the user switches to it (Monday and Saturday win). */
export function applySchedule(kind: ScheduleKind, minutes: number[]): number[] {
  if (kind === 'daily') return Array<number>(7).fill(minutes[0]);
  if (kind === 'weekdays') return [...Array<number>(5).fill(minutes[0]), minutes[5], minutes[5]];
  return [...minutes];
}

export function scheduleSummary(minutes: number[]): string {
  const text = (m: number) => (m === 0 ? 'blocked' : formatDuration(m * 60_000));
  const kind = scheduleKind(minutes);
  if (kind === 'daily') return minutes[0] === 0 ? 'Blocked every day' : `${text(minutes[0])} a day`;
  if (kind === 'weekdays') return `${text(minutes[0])} on weekdays · ${text(minutes[5])} on weekends`;
  return 'Different every day';
}

/** Why a rule can't be saved, or null. */
export function validateRule(rule: Rule): string | null {
  if (rule.packages.length === 0) return 'Choose at least one app.';
  if (rule.packages.length > 1 && rule.name.trim() === '') return 'Give the group a name.';
  if (rule.minutesByDay.length !== 7 || rule.minutesByDay.some((m) => !Number.isInteger(m) || m < 0 || m > 1440))
    return 'Minutes must be between 0 and 1440.';
  return null;
}

/** Why a new password can't be used, or null. */
export function validatePassword(password: string, repeat: string): string | null {
  if (password.length < 4) return 'Use at least 4 characters.';
  if (password !== repeat) return 'The passwords do not match.';
  return null;
}
