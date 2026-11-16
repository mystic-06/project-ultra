import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, TextInput, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pulse, pulseStyles } from '@/components/training/pulse';
import { useTraining } from '@/training/provider';

export default function SettingsScreen() {
  const { training, restSettings } = useTraining();
  const [seconds, setSeconds] = useState(String(restSettings.defaultSeconds));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function save(automatic: boolean, defaultSeconds: number) {
    try { await training.setRestSettings({ automatic, defaultSeconds }); setError(''); setMessage('Saved'); }
    catch { setMessage(''); setError('Could not save. Enter 1–86400 whole seconds and try again.'); }
  }
  return <SafeAreaView style={pulseStyles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={pulseStyles.content} keyboardShouldPersistTaps="handled">
      <View style={pulseStyles.card}>
        <Text style={pulseStyles.heading}>Rest timer</Text>
        <View style={styles.row}><Text style={[pulseStyles.text, styles.label]}>Start automatically after a check</Text>
          <Switch accessibilityLabel="Start rest automatically" value={restSettings.automatic} onValueChange={(value) => void save(value, restSettings.defaultSeconds)} />
        </View>
        <Text style={pulseStyles.text}>Default automatic rest (seconds)</Text>
        <TextInput accessibilityLabel="Default automatic rest in seconds" keyboardType="number-pad" value={seconds} onChangeText={(value) => { setSeconds(value); setMessage(''); }} style={styles.input} />
        <Pressable accessibilityRole="button" style={pulseStyles.button} onPress={() => void save(restSettings.automatic, Number(seconds))}><Text style={pulseStyles.buttonText}>Save duration</Text></Pressable>
        <Text style={pulseStyles.muted}>Routine exercises can override this duration. Manual rest is set in your workout.</Text>
        {error ? <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text> : <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>{message}</Text>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { flex: 1 },
  input: { minHeight: 48, color: pulse.text, backgroundColor: pulse.input, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
});
