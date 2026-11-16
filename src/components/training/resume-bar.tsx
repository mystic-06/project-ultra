import { Link, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTraining } from '@/training/provider';

import { pulse, pulseStyles } from './pulse';
import { WorkoutSaveFeedback } from './save-feedback';

export function ResumeWorkoutBar() {
  const { workout } = useTraining();
  const pathname = usePathname();
  if (!workout || pathname === '/' || pathname === '/workout') return null;

  return <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bar}>
    <Link href="/workout" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Resume workout: ${workout.title}`} style={styles.resume}>
        <Text style={[pulseStyles.text, styles.title]} numberOfLines={1}>{workout.title}</Text>
        <Text style={styles.action}>Resume</Text>
      </Pressable>
    </Link>
    <WorkoutSaveFeedback />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  bar: { backgroundColor: pulse.surface, borderTopColor: pulse.border, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 4 },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48 },
  title: { flex: 1 },
  action: { fontFamily: 'Manrope', color: pulse.accent, fontSize: 16, fontWeight: '700' },
});
