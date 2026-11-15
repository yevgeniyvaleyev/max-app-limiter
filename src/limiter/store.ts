import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';

import {
  AppLimiter,
  type Bedtime,
  type LaunchableApp,
  type LimiterState,
  type LimiterStatus,
  type Rule,
  type UnlockResult,
} from '@modules/app-limiter';

const EMPTY_STATE: LimiterState = {
  rules: [],
  bedtime: { enabled: false, startMinute: 21 * 60, endMinute: 7 * 60 },
  lockSettings: true,
  lockedPackages: [],
  warnMinutes: 5,
  pauseUntil: 0,
  day: '',
  usage: {},
  extra: {},
};

const EMPTY_STATUS: LimiterStatus = {
  serviceEnabled: false,
  adminActive: false,
  batteryExempt: false,
  notificationsAllowed: false,
};

/** How long a trip to a system screen that the app itself started may take before the app locks again. */
const SYSTEM_TRIP_MS = 2 * 60_000;

/** System screens the app can send the parent to. */
export type SystemScreen =
  'openAccessibilitySettings' | 'openAppSettings' | 'requestAdmin' | 'requestIgnoreBatteryOptimizations';

interface LimiterStore {
  /** Mirror of the native state: the native module is the source of truth, this is only for rendering. */
  state: LimiterState;
  status: LimiterStatus;
  /** Installed apps with a launcher icon; null until loaded. */
  apps: LaunchableApp[] | null;
  /** Session token while unlocked. */
  token: string | null;
  hasPassword: boolean;
  /** Until this moment, going to the background doesn't lock the app (a system screen the app opened itself). */
  keepUnlockedUntil: number;

  refresh(): void;
  loadApps(): Promise<void>;
  createPassword(password: string): Promise<void>;
  unlock(password: string): Promise<UnlockResult>;
  changePassword(password: string): Promise<void>;
  /** Locks unless the app is on a system screen it opened itself. */
  lockOnBackground(): void;
  /** The app is about to show a system dialog or screen: don't lock when it goes to the background for it. */
  expectSystemTrip(): void;
  /** Back in the foreground: the trip is over, and the native state may have changed meanwhile. */
  onForeground(): void;

  saveRule(rule: Rule): void;
  deleteRule(id: string): void;
  setBedtime(bedtime: Bedtime): void;
  setLocked(lockSettings: boolean, packages: string[]): void;
  setWarnMinutes(minutes: number): void;
  pauseLimits(until: number): void;
  grantExtra(ruleId: string, minutes: number): void;
  removeAdmin(): void;
  openSystem(screen: SystemScreen): void;
}

export const useLimiter = create<LimiterStore>((set, get) => {
  /** Runs a configuration call with the session token, then re-reads the native state. */
  const mutate = (call: (token: string) => void) => {
    const { token } = get();
    if (!AppLimiter || !token) return;
    call(token);
    get().refresh();
  };

  return {
    state: EMPTY_STATE,
    status: EMPTY_STATUS,
    apps: null,
    token: null,
    hasPassword: AppLimiter?.hasPassword() ?? false,
    keepUnlockedUntil: 0,

    refresh() {
      if (!AppLimiter) return;
      set({ state: AppLimiter.getState(), status: AppLimiter.getStatus(), hasPassword: AppLimiter.hasPassword() });
    },

    async loadApps() {
      if (!AppLimiter) return;
      const apps = await AppLimiter.getLaunchableApps().catch(() => []);
      set({ apps });
    },

    async createPassword(password) {
      if (!AppLimiter) return;
      const token = await AppLimiter.createPassword(password);
      set({ token, hasPassword: true });
      get().refresh();
    },

    async unlock(password) {
      if (!AppLimiter) return { ok: false, token: null, waitMs: 0, attemptsLeft: 0 };
      const result = await AppLimiter.unlock(password);
      if (result.ok) {
        set({ token: result.token });
        get().refresh();
      }
      return result;
    },

    async changePassword(password) {
      const { token } = get();
      if (AppLimiter && token) await AppLimiter.changePassword(token, password);
    },

    lockOnBackground() {
      if (Date.now() < get().keepUnlockedUntil) return;
      AppLimiter?.lock();
      set({ token: null });
    },

    expectSystemTrip() {
      set({ keepUnlockedUntil: Date.now() + SYSTEM_TRIP_MS });
    },

    onForeground() {
      set({ keepUnlockedUntil: 0 });
      get().refresh();
    },

    saveRule: (rule) => mutate((t) => AppLimiter!.saveRule(t, rule)),
    deleteRule: (id) => mutate((t) => AppLimiter!.deleteRule(t, id)),
    setBedtime: (bedtime) => mutate((t) => AppLimiter!.setBedtime(t, bedtime)),
    setLocked: (lockSettings, packages) => mutate((t) => AppLimiter!.setLocked(t, lockSettings, packages)),
    setWarnMinutes: (minutes) => mutate((t) => AppLimiter!.setWarnMinutes(t, minutes)),
    pauseLimits: (until) => mutate((t) => AppLimiter!.pauseLimits(t, until)),
    grantExtra: (ruleId, minutes) => mutate((t) => AppLimiter!.grantExtra(t, ruleId, minutes)),
    removeAdmin: () => mutate((t) => AppLimiter!.removeAdmin(t)),

    openSystem(screen) {
      get().expectSystemTrip();
      mutate((t) => AppLimiter![screen](t));
    },
  };
});

/** Label and icon of a package, falling back to the package name for apps that are no longer installed. */
export function appInfo(apps: LaunchableApp[] | null, packageName: string): LaunchableApp {
  return apps?.find((a) => a.packageName === packageName) ?? { packageName, label: packageName, icon: null };
}

/** Keeps the mirrored state fresh while a screen is focused (usage grows while the parent is looking at it). */
export function useLiveState(intervalMs = 15_000): void {
  useFocusEffect(
    useCallback(() => {
      useLimiter.getState().refresh();
      const timer = setInterval(() => useLimiter.getState().refresh(), intervalMs);
      return () => clearInterval(timer);
    }, [intervalMs]),
  );
}
