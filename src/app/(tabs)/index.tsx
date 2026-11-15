import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Rule } from '@modules/app-limiter';
import { AppIcon, Button, Card, ProgressBar } from '@/components/ui';
import { appInfo, useLimiter, useLiveState } from '@/limiter/store';
import { formatClock, formatDuration } from '@/logic/format';
import { inBedtime, remainingMs, totalMs, usedMs, weekdayIndex } from '@/logic/rules';
import { useColors } from '@/theme';

const clockOf = (date: Date) => formatClock(date.getHours() * 60 + date.getMinutes());

export default function LimitsScreen() {
  const colors = useColors();
  const state = useLimiter((s) => s.state);
  const status = useLimiter((s) => s.status);
  const apps = useLimiter((s) => s.apps);
  const unlocked = useLimiter((s) => s.token !== null);
  useLiveState();

  useEffect(() => {
    if (unlocked) void useLimiter.getState().loadApps();
  }, [unlocked]);

  const now = new Date();
  const weekday = weekdayIndex(now);
  const paused = state.pauseUntil > now.getTime();
  const bedtime = inBedtime(state.bedtime, now.getHours() * 60 + now.getMinutes());

  const pause = () => {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    Alert.alert(
      'Pause all limits',
      'Limited apps can be used freely; the time is still counted. Locked apps stay locked.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: '1 hour', onPress: () => useLimiter.getState().pauseLimits(Date.now() + 3_600_000) },
        { text: 'Rest of today', onPress: () => useLimiter.getState().pauseLimits(midnight) },
      ],
    );
  };

  const openRule = (id: string) => router.push({ pathname: '/rule/[id]', params: { id } });

  const ruleCard = (rule: Rule) => {
    const total = totalMs(rule, weekday, state.extra);
    const used = usedMs(rule, state.usage);
    const left = remainingMs(rule, weekday, state.usage, state.extra);
    const infos = rule.packages.map((p) => appInfo(apps, p));
    const status = !rule.enabled
      ? 'Switched off'
      : total === 0
        ? 'Not allowed today'
        : left <= 0
          ? 'Used up for today'
          : `${formatDuration(left)} left`;
    const statusColor = !rule.enabled ? colors.textMuted : left <= 0 ? colors.danger : colors.text;
    return (
      <Pressable key={rule.id} onPress={() => openRule(rule.id)} accessibilityRole="button">
        <Card style={[styles.rule, !rule.enabled && { opacity: 0.6 }]}>
          <View style={styles.ruleHead}>
            <View style={styles.icons}>
              {infos.slice(0, 3).map((a) => (
                <AppIcon key={a.packageName} uri={a.icon} size={infos.length > 1 ? 30 : 40} />
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                {rule.name || infos[0]?.label}
              </Text>
              {infos.length > 1 && (
                <Text style={{ color: colors.textMuted, fontSize: 13 }} numberOfLines={1}>
                  {infos.map((a) => a.label).join(', ')}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
          <ProgressBar used={used} total={total} />
          <View style={styles.ruleFoot}>
            <Text style={{ color: statusColor, fontSize: 14, fontWeight: '600' }}>{status}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {formatDuration(used, 'down')} of {formatDuration(total)}
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {!status.serviceEnabled && (
        <Card style={[styles.banner, { borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '700' }}>Limits are not active</Text>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            Turn on “Max App Limiter: app time limits” in the Accessibility settings. Without it no app is counted or
            blocked.
          </Text>
          <Button
            title="Open Accessibility settings"
            onPress={() => useLimiter.getState().openSystem('openAccessibilitySettings')}
          />
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            Greyed out? On Android 13+ open App info, tap ⋮ and choose “Allow restricted settings”, then try again.
          </Text>
          <Button
            title="Open App info"
            kind="plain"
            onPress={() => useLimiter.getState().openSystem('openAppSettings')}
          />
        </Card>
      )}

      {paused && (
        <Card style={styles.banner}>
          <Text style={{ color: colors.warning, fontSize: 16, fontWeight: '700' }}>
            Limits paused until {clockOf(new Date(state.pauseUntil))}
          </Text>
          <Button title="Resume now" kind="plain" onPress={() => useLimiter.getState().pauseLimits(0)} />
        </Card>
      )}

      {bedtime && !paused && (
        <Card style={styles.banner}>
          <Text style={{ color: colors.text, fontSize: 15 }}>
            Bedtime: limited apps are off until {formatClock(state.bedtime.endMinute)}.
          </Text>
        </Card>
      )}

      {state.rules.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="timer-outline" size={56} color={colors.textMuted} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>No limits yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center', lineHeight: 21 }}>
            Add a limit to give an app, or a group of apps, a daily amount of time. The time resets at midnight.
          </Text>
        </View>
      ) : (
        state.rules.map(ruleCard)
      )}

      <Button title="Add limit" icon="add" onPress={() => openRule('new')} />
      {state.rules.length > 0 && !paused && (
        <Button title="Pause all limits" kind="plain" icon="pause" onPress={pause} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  banner: { paddingVertical: 14, gap: 10 },
  rule: { paddingVertical: 14, gap: 12 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icons: { flexDirection: 'row', gap: 4 },
  ruleFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 },
});
