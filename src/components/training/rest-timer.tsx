import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pulse, pulseStyles } from './pulse';
import { useTraining } from '@/training/provider';

export function RestTimer() {
  const { training, restDeadline } = useTraining();
  const [now, setNow] = useState(() => Date.now());
  const [duration, setDuration] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', tick);
    return () => { clearInterval(interval); subscription.remove(); };
  }, [restDeadline]);

  const remaining = restDeadline === null ? 0 : Math.max(0, Math.ceil((restDeadline - now) / 1000));
  const status = restDeadline === null ? 'Ready' : remaining === 0 ? 'Finished' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  async function run(action: () => Promise<void>, failure: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try { await action(); }
    catch { setError(failure); }
    finally { pending.current = false; setBusy(false); }
  }

  function start() {
    const seconds = Number(duration);
    if (!/^\d+$/.test(duration) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) {
      setError('Enter a duration from 1 to 86400 seconds.');
      return;
    }
    void run(() => training.startRest(seconds), 'Could not start rest. Try again.');
  }

  return <View style={styles.card}>
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text style={styles.label}>REST TIMER</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      {restDeadline !== null && <Pressable accessibilityRole="button" accessibilityLabel="Skip rest" disabled={busy}
        onPress={() => void run(() => training.skipRest(), 'Could not skip rest. Try again.')}
        style={[styles.skip, busy && styles.disabled]}><Text style={styles.skipText}>Skip</Text></Pressable>}
    </View>
    {restDeadline !== null && <View style={styles.row}>
      <TimerButton label="−15 sec" accessibilityLabel="Remove 15 seconds from rest" disabled={busy} onPress={() => void run(() => training.adjustRest(-15), 'Could not adjust rest. Try again.')} />
      <TimerButton label="+15 sec" accessibilityLabel="Add 15 seconds to rest" disabled={busy} onPress={() => void run(() => training.adjustRest(15), 'Could not adjust rest. Try again.')} />
    </View>}
    <Text style={styles.manualLabel}>Manual rest · seconds</Text>
    <View style={styles.row}>
      <TextInput accessibilityLabel="Manual rest duration in seconds" keyboardType="number-pad" editable={!busy} value={duration} onChangeText={setDuration} placeholder="e.g. 90" placeholderTextColor={pulse.secondary} style={styles.input} />
      <TimerButton label="Start" accessibilityLabel="Start manual rest" disabled={busy} onPress={start} />
    </View>
    {error ? <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text> : null}
  </View>;
}
function TimerButton({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} disabled={disabled} onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={pulseStyles.text}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: pulse.input, borderRadius: 12, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { flex: 1, gap: 3 },
  label: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  status: { color: pulse.text, fontFamily: 'Manrope', fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualLabel: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 13 },
  input: { flex: 1, minWidth: 60, minHeight: 48, color: pulse.text, backgroundColor: pulse.background, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: pulse.border, borderRadius: 8 },
  skip: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: pulse.accent, borderRadius: 8 },
  skipText: { color: pulse.onAccent, fontFamily: 'Manrope', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
