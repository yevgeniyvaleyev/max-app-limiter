import { requireOptionalNativeModule } from 'expo';

/** A daily allowance shared by one or more apps. */
export interface Rule {
  id: string;
  name: string;
  packages: string[];
  /** Minutes allowed per weekday, Monday first (7 entries). */
  minutesByDay: number[];
  enabled: boolean;
}

/** Window (minutes of the day) in which every limited app is blocked; it may cross midnight. */
export interface Bedtime {
  enabled: boolean;
  startMinute: number;
  endMinute: number;
}

export interface LimiterState {
  rules: Rule[];
  bedtime: Bedtime;
  /** Settings and the app installers need the password. */
  lockSettings: boolean;
  /** Other apps that always need the password. */
  lockedPackages: string[];
  /** Warn this many minutes before a limit runs out; 0 = off. */
  warnMinutes: number;
  /** All limits are off until this moment (epoch ms). */
  pauseUntil: number;
  /** Today's key, 'YYYY-MM-DD'. */
  day: string;
  /** Milliseconds used today per package. */
  usage: Record<string, number>;
  /** Extra milliseconds granted today per rule id. */
  extra: Record<string, number>;
}

export interface DayUsage {
  day: string;
  usage: Record<string, number>;
}

export interface LimiterStatus {
  serviceEnabled: boolean;
  adminActive: boolean;
  batteryExempt: boolean;
  notificationsAllowed: boolean;
}

export interface LaunchableApp {
  packageName: string;
  label: string;
  /** file:// URI of the cached launcher icon. */
  icon: string | null;
}

export interface UnlockResult {
  ok: boolean;
  /** Session token for the configuration calls; null when the password was wrong. */
  token: string | null;
  /** Too many wrong tries: wait this long before the next one. */
  waitMs: number;
  attemptsLeft: number;
}

interface AppLimiterModule {
  hasPassword(): boolean;
  createPassword(password: string): Promise<string>;
  unlock(password: string): Promise<UnlockResult>;
  changePassword(token: string, password: string): Promise<void>;
  lock(): void;

  getState(): LimiterState;
  getUsage(days: number): DayUsage[];
  getStatus(): LimiterStatus;
  getLaunchableApps(): Promise<LaunchableApp[]>;

  saveRule(token: string, rule: Rule): void;
  deleteRule(token: string, id: string): void;
  setBedtime(token: string, bedtime: Bedtime): void;
  setLocked(token: string, lockSettings: boolean, packages: string[]): void;
  setWarnMinutes(token: string, minutes: number): void;
  pauseLimits(token: string, until: number): void;
  grantExtra(token: string, ruleId: string, minutes: number): void;

  openAccessibilitySettings(token: string): void;
  openAppSettings(token: string): void;
  requestAdmin(token: string): void;
  removeAdmin(token: string): void;
  requestIgnoreBatteryOptimizations(token: string): void;
}

/** Native limiter; null in Expo Go and on platforms without the module (it is Android-only). */
export const AppLimiter = requireOptionalNativeModule<AppLimiterModule>('AppLimiter');
