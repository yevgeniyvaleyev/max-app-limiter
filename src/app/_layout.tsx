import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LockGate } from '@/components/LockGate';
import { useLimiter } from '@/limiter/store';
import { useColors, useIsDark } from '@/theme';

export default function RootLayout() {
  const colors = useColors();
  const isDark = useIsDark();
  const locked = useLimiter((s) => s.token === null);

  useEffect(() => {
    // The app locks as soon as it leaves the screen, so a child picking up the phone finds the password prompt.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') useLimiter.getState().lockOnBackground();
      else if (state === 'active') useLimiter.getState().onForeground();
    });
    return () => sub.remove();
  }, []);

  // The window background shows behind the transparent system bars (edge-to-edge) and during transitions.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background);
  }, [colors.background]);

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [isDark, colors]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <NavigationBar style={isDark ? 'dark' : 'light'} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="rule/[id]" options={{ title: 'Limit' }} />
          <Stack.Screen name="pick-apps" options={{ title: 'Choose apps' }} />
          <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
        </Stack>
        {locked && <LockGate />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
