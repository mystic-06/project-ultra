import { Pressable, Text, View } from 'react-native';
import { pulse, pulseStyles as styles } from './pulse';

export function EditAction({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}
    style={{ minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 8, backgroundColor: pulse.input, opacity: disabled ? 0.5 : 1 }} onPress={onPress}>
    <Text style={styles.text}>{label}</Text>
  </Pressable>;
}

export function EditActions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}
