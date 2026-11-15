import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/ui';
import { useDraft } from '@/limiter/draft';
import { useLimiter } from '@/limiter/store';
import { useColors } from '@/theme';

/**
 * App picker with two uses: the apps of the rule being edited (`target=rule`, changes the draft) and the apps
 * that always need the password (`target=locked`, saved at once).
 */
export default function PickAppsScreen() {
  const { target } = useLocalSearchParams<{ target: 'rule' | 'locked' }>();
  const colors = useColors();
  const apps = useLimiter((s) => s.apps);
  const state = useLimiter((s) => s.state);
  const draft = useDraft((s) => s.rule);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!apps) void useLimiter.getState().loadApps();
  }, [apps]);

  const forRule = target === 'rule';
  const selected = useMemo(
    () => new Set(forRule ? (draft?.packages ?? []) : state.lockedPackages),
    [forRule, draft, state.lockedPackages],
  );

  /** Name of another rule that already limits the package (it would move to this one). */
  const otherRule = (pkg: string) =>
    forRule ? state.rules.find((r) => r.id !== draft?.id && r.packages.includes(pkg))?.name : undefined;

  const toggle = (pkg: string) => {
    if (forRule) return useDraft.getState().togglePackage(pkg);
    const next = selected.has(pkg) ? state.lockedPackages.filter((p) => p !== pkg) : [...state.lockedPackages, pkg];
    useLimiter.getState().setLocked(state.lockSettings, next);
  };

  // Selected apps first; the order is fixed when the list loads so rows don't jump while tapping.
  const [initial] = useState(selected);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (apps ?? [])
      .filter((a) => q === '' || a.label.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q))
      .sort((a, b) => Number(initial.has(b.packageName)) - Number(initial.has(a.packageName)));
  }, [apps, query, initial]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: forRule ? 'Apps to limit' : 'Locked apps' }} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
      />
      <Text style={[styles.count, { color: colors.textMuted }]}>
        {forRule ? 'Selected' : 'Always ask for the password'}: {selected.size}
      </Text>
      {!apps ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(a) => a.packageName}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 6 }}
          renderItem={({ item }) => {
            const on = selected.has(item.packageName);
            const other = otherRule(item.packageName);
            return (
              <Pressable
                onPress={() => toggle(item.packageName)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
                ]}
              >
                <AppIcon uri={item.icon} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {other ? `In “${other}” — selecting moves it here` : item.packageName}
                  </Text>
                </View>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={on ? colors.primary : colors.border}
                />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    margin: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  count: { fontSize: 13, marginHorizontal: 20, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
