import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppIcon, Button, Card, Chip, Divider, Row, SectionTitle } from '@/components/ui';
import { newRule, useDraft } from '@/limiter/draft';
import { appInfo, useLimiter } from '@/limiter/store';
import { formatDuration, parseMinutes } from '@/logic/format';
import {
  applySchedule,
  remainingMs,
  scheduleKind,
  usedMs,
  validateRule,
  WEEKDAYS,
  weekdayIndex,
  type ScheduleKind,
} from '@/logic/rules';
import { useColors } from '@/theme';

const KINDS: { kind: ScheduleKind; title: string }[] = [
  { kind: 'daily', title: 'Every day' },
  { kind: 'weekdays', title: 'Weekdays / weekend' },
  { kind: 'custom', title: 'Each day' },
];

/** Which days one minutes field controls, per schedule kind. */
const FIELDS: Record<ScheduleKind, { label: string; days: number[] }[]> = {
  daily: [{ label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] }],
  weekdays: [
    { label: 'Monday – Friday', days: [0, 1, 2, 3, 4] },
    { label: 'Saturday, Sunday', days: [5, 6] },
  ],
  custom: WEEKDAYS.map((label, i) => ({ label, days: [i] })),
};

function MinutesField({ label, value, onChange }: { label: string; value: number; onChange: (m: number) => void }) {
  const colors = useColors();
  return (
    <View style={styles.minutes}>
      <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>{label}</Text>
      <Button title="−5" kind="plain" small onPress={() => onChange(Math.max(0, value - 5))} />
      <TextInput
        value={value === 0 ? '' : String(value)}
        onChangeText={(t) => onChange(parseMinutes(t))}
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={4}
        accessibilityLabel={`${label}, minutes`}
        style={[
          styles.minutesInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>min</Text>
      <Button title="+5" kind="plain" small onPress={() => onChange(Math.min(1440, value + 5))} />
    </View>
  );
}

export default function RuleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const state = useLimiter((s) => s.state);
  const apps = useLimiter((s) => s.apps);
  const rule = useDraft((s) => s.rule);
  const existing = state.rules.find((r) => r.id === id);
  const isNew = !existing;
  const [kind, setKind] = useState<ScheduleKind>(() => scheduleKind((existing ?? newRule()).minutesByDay));

  // The draft outlives a trip to the app picker; it starts once per opened rule.
  useEffect(() => {
    useDraft.getState().start(existing ?? newRule());
    return () => useDraft.getState().clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!rule) return null;

  const infos = rule.packages.map((p) => appInfo(apps, p));
  const patch = useDraft.getState().patch;
  const weekday = weekdayIndex(new Date());

  const setMinutes = (days: number[], minutes: number) =>
    patch({ minutesByDay: rule.minutesByDay.map((m, i) => (days.includes(i) ? minutes : m)) });

  const changeKind = (next: ScheduleKind) => {
    setKind(next);
    patch({ minutesByDay: applySchedule(next, rule.minutesByDay) });
  };

  const save = () => {
    const problem = validateRule(rule);
    if (problem) return Alert.alert('Cannot save', problem);
    useLimiter.getState().saveRule({ ...rule, name: rule.name.trim() || infos[0].label });
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete this limit?', 'The apps will no longer be limited.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          useLimiter.getState().deleteRule(rule.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isNew ? 'New limit' : 'Edit limit' }} />

      <SectionTitle>Apps</SectionTitle>
      <Card>
        {infos.map((a) => (
          <View key={a.packageName}>
            <View style={styles.app}>
              <AppIcon uri={a.icon} size={32} />
              <Text style={{ color: colors.text, fontSize: 16, flex: 1 }} numberOfLines={1}>
                {a.label}
              </Text>
            </View>
            <Divider />
          </View>
        ))}
        <Row
          title={infos.length === 0 ? 'Choose apps' : 'Change apps'}
          hint={infos.length > 1 ? 'These apps share one allowance.' : undefined}
          onPress={() => router.push({ pathname: '/pick-apps', params: { target: 'rule' } })}
        />
      </Card>

      <SectionTitle>Name</SectionTitle>
      <TextInput
        value={rule.name}
        onChangeText={(name) => patch({ name })}
        placeholder={infos.length > 1 ? 'Group name, e.g. Social' : (infos[0]?.label ?? 'Name')}
        placeholderTextColor={colors.textMuted}
        maxLength={40}
        style={[styles.name, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
      />

      <SectionTitle>Time per day</SectionTitle>
      <View style={styles.chips}>
        {KINDS.map((k) => (
          <Chip key={k.kind} title={k.title} selected={kind === k.kind} onPress={() => changeKind(k.kind)} />
        ))}
      </View>
      <Card style={{ marginTop: 10 }}>
        {FIELDS[kind].map((f, i) => (
          <View key={f.label}>
            {i > 0 && <Divider />}
            <MinutesField
              label={f.label}
              value={rule.minutesByDay[f.days[0]]}
              onChange={(m) => setMinutes(f.days, m)}
            />
          </View>
        ))}
      </Card>
      <Text style={[styles.note, { color: colors.textMuted }]}>0 minutes blocks the apps for the whole day.</Text>

      <Card style={{ marginTop: 16 }}>
        <Row
          title="Limit is on"
          right={<Switch value={rule.enabled} onValueChange={(enabled) => patch({ enabled })} />}
        />
      </Card>

      {existing && (
        <>
          <SectionTitle>Today</SectionTitle>
          <Card style={{ paddingVertical: 14, gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>
              {formatDuration(usedMs(existing, state.usage), 'down')} used,{' '}
              {formatDuration(remainingMs(existing, weekday, state.usage, state.extra))} left
              {state.extra[existing.id] ? ` (includes ${formatDuration(state.extra[existing.id])} extra)` : ''}
            </Text>
            <View style={styles.chips}>
              {[15, 30, 60].map((m) => (
                <Button
                  key={m}
                  title={`+${m} min today`}
                  kind="plain"
                  small
                  onPress={() => useLimiter.getState().grantExtra(existing.id, m)}
                />
              ))}
            </View>
          </Card>
        </>
      )}

      <Button title="Save" onPress={save} style={{ marginTop: 24 }} />
      {existing && <Button title="Delete limit" kind="danger" onPress={remove} style={{ marginTop: 10 }} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  app: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minutes: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  minutesInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    width: 64,
    paddingVertical: 6,
    fontSize: 17,
    textAlign: 'center',
  },
  note: { fontSize: 13, marginTop: 8, marginLeft: 4 },
});
