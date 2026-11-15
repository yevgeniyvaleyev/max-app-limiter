import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useColors } from '@/theme';

/** Launcher icon of an app, or a neutral placeholder when it isn't installed any more. */
export function AppIcon({ uri, size = 40 }: { uri: string | null; size?: number }) {
  const colors = useColors();
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 5 }} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 5,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="apps" size={size * 0.55} color={colors.textMuted} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.section, { color: colors.textMuted }]}>{children}</Text>;
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'plain' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, small, style }: ButtonProps) {
  const colors = useColors();
  const fill = kind === 'primary' ? colors.primary : colors.surfaceAlt;
  const ink = kind === 'primary' ? colors.onPrimary : kind === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: fill, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={small ? 16 : 18} color={ink} />}
      <Text style={{ color: ink, fontSize: small ? 14 : 16, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/** One of several mutually exclusive choices in a row. */
export function Chip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary : colors.surfaceAlt, borderColor: colors.border },
      ]}
    >
      <Text style={{ color: selected ? colors.onPrimary : colors.text, fontSize: 14, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/** Used / allowed bar; turns orange when little is left and red when it is used up. */
export function ProgressBar({ used, total }: { used: number; total: number }) {
  const colors = useColors();
  const ratio = total <= 0 ? 1 : Math.min(1, Math.max(0, used / total));
  const color = ratio >= 1 ? colors.danger : ratio >= 0.8 ? colors.warning : colors.primary;
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
      <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

/** A settings line: title and hint on the left, a control on the right. */
export function Row({
  title,
  hint,
  right,
  onPress,
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '500' }}>{title}</Text>
        {hint ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export function Divider() {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 4 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  chip: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 9, paddingHorizontal: 12 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
});
