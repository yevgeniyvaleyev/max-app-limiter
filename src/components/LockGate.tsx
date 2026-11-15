import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppLimiter } from '@modules/app-limiter';
import { Button } from '@/components/ui';
import { useLimiter } from '@/limiter/store';
import { formatDuration } from '@/logic/format';
import { validatePassword } from '@/logic/rules';
import { useColors } from '@/theme';

/**
 * Covers the whole app while it is locked: creates the master password on the first run, asks for it afterwards.
 * The check itself happens in the native module.
 */
export function LockGate() {
  const colors = useColors();
  const hasPassword = useLimiter((s) => s.hasPassword);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Back must not reveal the screens underneath: it leaves the app instead.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const input = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    color: colors.text,
  };

  if (!AppLimiter) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
        <Ionicons name="construct-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.title, { color: colors.text }]}>Not available here</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          Max App Limiter needs its native Android module, which is not part of Expo Go. Install the built APK.
        </Text>
      </SafeAreaView>
    );
  }

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!hasPassword) {
      const problem = validatePassword(password, repeat);
      if (problem) return setError(problem);
    } else if (password === '') return;
    setBusy(true);
    try {
      if (!hasPassword) {
        await useLimiter.getState().createPassword(password);
      } else {
        const result = await useLimiter.getState().unlock(password);
        if (!result.ok) {
          setPassword('');
          if (result.waitMs > 0) setError(`Too many wrong tries. Try again in ${formatDuration(result.waitMs)}.`);
          else if (result.attemptsLeft > 0)
            setError(`Wrong password. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`);
          else setError('Wrong password.');
        }
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior="padding" style={styles.form}>
        <Ionicons name="shield-checkmark" size={56} color={colors.primary} style={{ alignSelf: 'center' }} />
        <Text style={[styles.title, { color: colors.text }]}>
          {hasPassword ? 'Enter the password' : 'Create a master password'}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          {hasPassword
            ? 'Limits can only be changed with the master password.'
            : 'It protects the limits and is asked for whenever someone wants more time. There is no way to recover it, so write it down.'}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType={hasPassword ? 'done' : 'next'}
          onSubmitEditing={hasPassword ? submit : undefined}
          style={[styles.input, input]}
        />
        {!hasPassword && (
          <TextInput
            value={repeat}
            onChangeText={setRepeat}
            placeholder="Repeat the password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[styles.input, input]}
          />
        )}
        {error && <Text style={{ color: colors.danger, fontSize: 14, textAlign: 'center' }}>{error}</Text>}
        <Button title={hasPassword ? 'Unlock' : 'Create password'} onPress={submit} disabled={busy} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 28 },
  form: { width: '100%', maxWidth: 420, gap: 14 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  text: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
  },
});
