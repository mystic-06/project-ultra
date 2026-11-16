import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { pulse, pulseStyles } from './pulse';
import { useTraining } from '@/training/provider';

export function RestTimer() {
  const { training, restDeadline } = useTraining();
  const [, refresh] = useState(0);
  const [duration, setDuration] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const tick = () => refresh((value) => value + 1);
    const interval = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', tick);
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);
  const timer = training.getRestTimer();
  const minutes = Math.floor(timer.remainingSeconds / 60);
  const seconds = String(timer.remainingSeconds % 60).padStart(2, '0');
  async function run(action: () => Promise<void>) {
    try { await action(); setError(''); } catch { setError('Could not save timer. Enter 1–86400 whole seconds and try again.'); }
  }
  return <View style={pulseStyles.card}>
    <Text style={pulseStyles.heading}>Rest · {timer.state === 'idle' ? 'Ready' : timer.state === 'finished' ? 'Finished' : `${minutes}:${seconds}`}</Text>
    {restDeadline !== null && <View style={styles.row}>
      <Button label="−15 sec" onPress={() => void run(() => training.adjustRest(-15))} />
      <Button label="+15 sec" onPress={() => void run(() => training.adjustRest(15))} />
      <Button label="Skip" onPress={() => void run(() => training.skipRest())} />
    </View>}
    <View style={styles.row}>
      <TextInput accessibilityLabel="Manual rest duration in seconds" keyboardType="number-pad" value={duration} onChangeText={setDuration} placeholder="Seconds" placeholderTextColor={pulse.secondary} style={styles.input} />
      <Button label="Start rest" onPress={() => void run(() => training.startRest(Number(duration)))} />
    </View>
    {error ? <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text> : null}
  </View>;
}
function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={pulseStyles.text}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  input: { flex: 1, minWidth: 100, minHeight: 48, color: pulse.text, backgroundColor: pulse.input, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: pulse.border, borderRadius: 8 },
});
