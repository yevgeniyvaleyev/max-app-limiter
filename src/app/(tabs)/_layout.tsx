import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';

import { useColors } from '@/theme';

// Tab bar colors may be any ColorValue; ours are always plain strings.
const tabIcon = (name: keyof typeof Ionicons.glyphMap) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return <Ionicons name={name} color={color as string} size={size} />;
  };

export default function TabsLayout() {
  const colors = useColors();
  return (
    <Tabs
      screenOptions={{
        // Explicit theme colors, so the bar (and the system nav bar area under it) follows the theme.
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Limits', tabBarIcon: tabIcon('timer-outline') }} />
      <Tabs.Screen name="stats" options={{ title: 'Usage', tabBarIcon: tabIcon('stats-chart') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings-outline') }} />
    </Tabs>
  );
}
