import { create } from 'zustand';

import type { Rule } from '@modules/app-limiter';

interface DraftStore {
  /** The rule being edited; the app picker changes its packages before anything is saved. */
  rule: Rule | null;
  start(rule: Rule): void;
  patch(patch: Partial<Rule>): void;
  togglePackage(packageName: string): void;
  clear(): void;
}

export const useDraft = create<DraftStore>((set, get) => ({
  rule: null,
  start: (rule) => set({ rule }),
  patch: (patch) => {
    const { rule } = get();
    if (rule) set({ rule: { ...rule, ...patch } });
  },
  togglePackage: (packageName) => {
    const { rule } = get();
    if (!rule) return;
    const packages = rule.packages.includes(packageName)
      ? rule.packages.filter((p) => p !== packageName)
      : [...rule.packages, packageName];
    set({ rule: { ...rule, packages } });
  },
  clear: () => set({ rule: null }),
}));

export function newRule(): Rule {
  return {
    id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    packages: [],
    minutesByDay: Array<number>(7).fill(30),
    enabled: true,
  };
}
