import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui';
import { useLimiter } from '@/limiter/store';
import { validatePassword } from '@/logic/rules';
import { useColors } from '@/theme';

/** The session is already unlocked with the current password, so only the new one is asked for. */
export default function ChangePasswordScreen() {
  const colors = useColors();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface };

  const save = async () => {
    const problem = validatePassword(password, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await useLimiter.getState().changePassword(password);
      Alert.alert('Password changed');
      router.back();
    } catch {
      setError('The password could not be changed. Lock the app, unlock it and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.content}>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, input]}
      />
      <TextInput
        value={repeat}
        onChangeText={setRepeat}
        placeholder="Repeat the new password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={save}
        style={[styles.input, input]}
      />
      {error && <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text>}
      <Button title="Save new password" onPress={save} disabled={busy} />
      <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
        There is no way to recover a lost password, so write it down.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
  },
});
