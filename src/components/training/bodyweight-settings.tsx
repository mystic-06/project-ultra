import { useState } from 'react';
import { formatLoad } from '@/training/workout';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { useTraining } from '@/training/provider';
import { pulse, pulseStyles as styles } from './pulse';

export function BodyweightSettings({ setup = false }: { setup?: boolean }) {
  const { bodyweightSettings, loadUnit } = useTraining();
  return <BodyweightSettingsForm key={`${bodyweightSettings.bodyweight}:${bodyweightSettings.bodyweightUnit}:${loadUnit}`} setup={setup} />;
}

function BodyweightSettingsForm({ setup }: { setup: boolean }) {
  const { training, bodyweightSettings, loadUnit } = useTraining();
  const [weight, setWeight] = useState(formatLoad(bodyweightSettings.bodyweight ?? '', bodyweightSettings.bodyweightUnit ?? 'kg', loadUnit));
  const [error, setError] = useState('');
  const [unit, setUnit] = useState(loadUnit);
  const [saving, setSaving] = useState(false);
  async function save(value: string | null) {
    setSaving(true);
    try {
      const unchanged = !setup && value === (formatLoad(bodyweightSettings.bodyweight ?? '', bodyweightSettings.bodyweightUnit ?? 'kg', unit) || null);
      await training.setBodyweightSettings({ ...(unchanged ? {} : { bodyweight: value, bodyweightUnit: unit }), setupComplete: true });
      setError('');
    } catch { setError('Could not save. Enter a positive bodyweight with up to two decimal places and retry.'); }
    finally { setSaving(false); }
  }
  async function toggle(writeback: boolean) {
    try { await training.setBodyweightSettings({ writeback }); setError(''); }
    catch { setError('Could not update writeback. Please retry.'); }
  }

  return <View style={styles.card}>
    <Text style={styles.heading}>{setup ? 'Set up bodyweight' : 'Bodyweight'}</Text>
    <Text style={styles.muted}>Optional. Enter your starting bodyweight in {unit}. Your display unit stays {loadUnit}.</Text>
    {setup && <View style={{ flexDirection: 'row', gap: 16 }}>{(['kg', 'lb'] as const).map((option) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: unit === option, disabled: saving }} disabled={saving} onPress={() => { setUnit(option); setWeight(''); }}><Text style={styles.text}>{unit === option ? '● ' : '○ '}{option}</Text></Pressable>)}</View>}
    <TextInput accessibilityLabel={`Default bodyweight in ${unit}`} keyboardType="decimal-pad" value={weight} onChangeText={setWeight} placeholder={`Bodyweight (${unit})`} placeholderTextColor={pulse.secondary} style={{ minHeight: 48, backgroundColor: pulse.input, color: pulse.text, paddingHorizontal: 12, borderRadius: 8 }} />
    <Pressable accessibilityRole="button" disabled={saving} style={styles.button} onPress={() => void save(weight || null)}><Text style={styles.buttonText}>Save bodyweight</Text></Pressable>
    {setup ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save(null)}><Text style={styles.text}>Skip for now</Text></Pressable> : <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={[styles.text, { flex: 1 }]}>Update default from workout edits</Text><Switch accessibilityLabel="Update default from workout edits" value={bodyweightSettings.writeback} onValueChange={(value) => void toggle(value)} /></View>}
    {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
  </View>;
}
