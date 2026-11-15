import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppLimiter, type DayUsage } from '@modules/app-limiter';
import { AppIcon, Card, Divider, SectionTitle } from '@/components/ui';
import { appInfo, useLimiter, useLiveState } from '@/limiter/store';
import { formatDuration } from '@/logic/format';
import { appTotals, lastDays } from '@/logic/stats';
import { useColors } from '@/theme';

const DAYS = 7;
const CHART_HEIGHT = 120;

export default function StatsScreen() {
  const colors = useColors();
  const state = useLimiter((s) => s.state);
  const apps = useLimiter((s) => s.apps);
  const [history, setHistory] = useState<DayUsage[]>([]);
  useLiveState();

  useFocusEffect(
    useCallback(() => {
      setHistory(AppLimiter?.getUsage(DAYS + 1) ?? []);
    }, []),
  );

  // Today comes from the live state, so the last bar grows while the screen is open.
  const days = lastDays(
    [...history.filter((h) => h.day !== state.day), { day: state.day, usage: state.usage }],
    state.day,
    DAYS,
  );
  const max = Math.max(...days.map((d) => d.totalMs), 60_000);
  const today = appTotals(state.usage);
  const todayTotal = today.reduce((sum, a) => sum + a.ms, 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle>Last 7 days</SectionTitle>
      <Card style={{ paddingVertical: 16 }}>
        <View style={styles.chart}>
          {days.map((d) => {
            const isToday = d.day === state.day;
            return (
              <View
                key={d.day}
                style={styles.column}
                accessibilityLabel={`${d.label}: ${formatDuration(d.totalMs, 'down')}`}
              >
                <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                  {d.totalMs >= 60_000 ? formatDuration(d.totalMs, 'down').replace(' min', 'm').replace(' h', 'h') : ''}
                </Text>
                <View
                  style={{
                    width: '70%',
                    height: Math.max(2, (d.totalMs / max) * CHART_HEIGHT),
                    borderRadius: 4,
                    backgroundColor: isToday ? colors.primary : colors.border,
                  }}
                />
                <Text
                  style={{
                    color: isToday ? colors.text : colors.textMuted,
                    fontSize: 12,
                    fontWeight: isToday ? '700' : '400',
                  }}
                >
                  {d.label}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      <SectionTitle>Today</SectionTitle>
      <Card>
        <View style={styles.app}>
          <Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' }}>All limited apps</Text>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            {formatDuration(todayTotal, 'down')}
          </Text>
        </View>
        {today.map((a) => {
          const info = appInfo(apps, a.packageName);
          return (
            <View key={a.packageName}>
              <Divider />
              <View style={styles.app}>
                <AppIcon uri={info.icon} size={32} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 15 }} numberOfLines={1}>
                  {info.label}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>{formatDuration(a.ms, 'down')}</Text>
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Only apps that have a limit are counted. History is kept for 30 days.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT + 40 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  app: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  note: { fontSize: 13, marginTop: 10, marginLeft: 4, lineHeight: 18 },
});
