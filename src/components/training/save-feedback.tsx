import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTraining } from '@/training/provider';

import { pulse, pulseStyles } from './pulse';

export function WorkoutSaveFeedback() {
  const { training, saveStatus } = useTraining();
  const label = {
    saved: 'Saved',
    saving: 'Saving…',
    failed: 'Some changes could not be saved',
    editing: 'Incomplete input · not saved',
  }[saveStatus];

  return <View style={styles.feedback}>
    <Text accessibilityLiveRegion="polite" style={[styles.status, saveStatus === 'failed' && pulseStyles.error]}>{label}</Text>
    {saveStatus === 'failed' && <Pressable accessibilityRole="button" accessibilityLabel="Retry saving latest workout values"
      style={styles.retry} onPress={() => { void training.retryFailedSaves(); }}>
      <Text style={styles.retryText}>Retry</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  feedback: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  status: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 13, flex: 1 },
  retry: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  retryText: { color: pulse.accent, fontFamily: 'Manrope', fontSize: 14, fontWeight: '700' },
});
