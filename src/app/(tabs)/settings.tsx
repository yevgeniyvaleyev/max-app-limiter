import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, PermissionsAndroid, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AppLimiter } from '@modules/app-limiter';
import { Button, Card, Chip, Divider, Row, SectionTitle } from '@/components/ui';
import { useLimiter, useLiveState } from '@/limiter/store';
import { formatClock } from '@/logic/format';
import { useColors } from '@/theme';

const WARN_CHOICES = [0, 1, 5, 10];
const TIME_STEP = 15;

/** "− 21:00 +" in quarter-hour steps. */
function TimeStepper({ label, minute, onChange }: { label: string; minute: number; onChange: (m: number) => void }) {
  const colors = useColors();
  const step = (delta: number) => onChange((minute + delta + 1440) % 1440);
  return (
    <View style={styles.time}>
      <Text style={{ flex: 1, color: colors.text, fontSize: 16 }}>{label}</Text>
      <Button title="−" kind="plain" small onPress={() => step(-TIME_STEP)} />
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', width: 56, textAlign: 'center' }}>
        {formatClock(minute)}
      </Text>
      <Button title="+" kind="plain" small onPress={() => step(TIME_STEP)} />
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const state = useLimiter((s) => s.state);
  const status = useLimiter((s) => s.status);
  const limiter = useLimiter.getState();
  useLiveState(5_000);

  const ok = <Ionicons name="checkmark-circle" size={24} color={colors.success} />;

  const askNotifications = async () => {
    // Before Android 13 notifications need no runtime permission; if they are off, only Settings can help.
    if (Platform.OS !== 'android' || Platform.Version < 33) return limiter.openSystem('openAppSettings');
    limiter.expectSystemTrip();
    const result = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) limiter.openSystem('openAppSettings');
    limiter.refresh();
  };

  const toggleAdmin = (on: boolean) => {
    if (on) return limiter.openSystem('requestAdmin');
    Alert.alert('Turn off uninstall protection?', 'The app can then be uninstalled like any other app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', style: 'destructive', onPress: () => limiter.removeAdmin() },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionTitle>Protection</SectionTitle>
      <Card>
        <Row
          title="Limiter service"
          hint={
            status.serviceEnabled
              ? 'On: apps are counted and blocked.'
              : 'Off: nothing is limited. Turn on “Max App Limiter: app time limits” in Accessibility.'
          }
          right={
            status.serviceEnabled ? (
              ok
            ) : (
              <Button title="Turn on" small onPress={() => limiter.openSystem('openAccessibilitySettings')} />
            )
          }
        />
        {!status.serviceEnabled && (
          <>
            <Divider />
            <Row
              title="Setting greyed out?"
              hint="Android 13+: App info → ⋮ → “Allow restricted settings”."
              right={
                <Button title="App info" kind="plain" small onPress={() => limiter.openSystem('openAppSettings')} />
              }
            />
          </>
        )}
        <Divider />
        <Row
          title="Uninstall protection"
          hint="Registers the app as a device admin, so it can't be uninstalled until this is turned off."
          right={<Switch value={status.adminActive} onValueChange={toggleAdmin} />}
        />
        <Divider />
        <Row
          title="Run without battery limits"
          hint="Keeps Android from stopping the service in the background."
          right={
            status.batteryExempt ? (
              ok
            ) : (
              <Button title="Allow" small onPress={() => limiter.openSystem('requestIgnoreBatteryOptimizations')} />
            )
          }
        />
        <Divider />
        <Row
          title="Notifications"
          hint="For the warning shortly before a limit runs out."
          right={status.notificationsAllowed ? ok : <Button title="Allow" small onPress={askNotifications} />}
        />
      </Card>

      <SectionTitle>Locked apps</SectionTitle>
      <Card>
        <Row
          title="Lock Settings and app installer"
          hint="The password is needed to open Settings, so the limiter can't be switched off, stopped or uninstalled, and the date can't be changed."
          right={
            <Switch value={state.lockSettings} onValueChange={(on) => limiter.setLocked(on, state.lockedPackages)} />
          }
        />
        <Divider />
        <Row
          title="Other locked apps"
          hint={
            state.lockedPackages.length === 0
              ? 'Apps that always need the password, e.g. Play Store.'
              : `${state.lockedPackages.length} selected`
          }
          onPress={() => router.push({ pathname: '/pick-apps', params: { target: 'locked' } })}
        />
      </Card>

      <SectionTitle>Bedtime</SectionTitle>
      <Card>
        <Row
          title="Block limited apps at night"
          hint="During bedtime every app that has a limit is blocked, whatever time is left."
          right={
            <Switch
              value={state.bedtime.enabled}
              onValueChange={(enabled) => limiter.setBedtime({ ...state.bedtime, enabled })}
            />
          }
        />
        {state.bedtime.enabled && (
          <>
            <Divider />
            <TimeStepper
              label="From"
              minute={state.bedtime.startMinute}
              onChange={(startMinute) => limiter.setBedtime({ ...state.bedtime, startMinute })}
            />
            <Divider />
            <TimeStepper
              label="Until"
              minute={state.bedtime.endMinute}
              onChange={(endMinute) => limiter.setBedtime({ ...state.bedtime, endMinute })}
            />
          </>
        )}
      </Card>

      <SectionTitle>Warning before time runs out</SectionTitle>
      <View style={styles.chips}>
        {WARN_CHOICES.map((m) => (
          <Chip
            key={m}
            title={m === 0 ? 'Off' : `${m} min`}
            selected={state.warnMinutes === m}
            onPress={() => limiter.setWarnMinutes(m)}
          />
        ))}
      </View>

      <SectionTitle>Password</SectionTitle>
      <Card>
        <Row title="Change password" onPress={() => router.push('/change-password')} />
      </Card>
      <Button
        title="Lock now"
        kind="plain"
        icon="lock-closed"
        style={{ marginTop: 12 }}
        onPress={() => {
          AppLimiter?.lock();
          useLimiter.setState({ token: null });
        }}
      />

      <Text style={[styles.note, { color: colors.textMuted }]}>
        Good to know: restarting the phone in safe mode switches every limiter off (that is also the way out if the
        password is lost). Apps in picture-in-picture or split screen may not be caught.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 24, marginHorizontal: 4 },
});
