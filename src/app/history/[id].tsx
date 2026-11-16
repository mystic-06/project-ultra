import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulseStyles as styles } from '@/components/training/pulse';
import { WorkoutResults } from '@/components/training/workout-results';
import { useTraining } from '@/training/provider';
import { summarizeWorkout, type CompletedWorkout } from '@/training/workout';

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HistoryDetail key={id} id={id} />;
}

function HistoryDetail({ id }: { id: string }) {
  const { training } = useTraining();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    training.getCompletedWorkout(id).then((result) => {
      if (!disposed) { setWorkout(result); setState('ready'); }
    }).catch(() => { if (!disposed) setState('failed'); });
    return () => { disposed = true; };
  }, [training, id, attempt]);

  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      {state === 'loading' ? <Text style={styles.text}>Opening workout…</Text> : state === 'failed' ? <>
        <Text style={styles.error}>Could not open this workout.</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setState('loading'); setAttempt(attempt + 1); }}><Text style={styles.buttonText}>Retry</Text></Pressable>
      </> : !workout ? <Text style={styles.heading}>Workout not found</Text> : <>
        <Text style={styles.muted}>COMPLETED WORKOUT</Text>
        <Text style={styles.title}>{workout.title}</Text>
        <Text style={styles.muted}>{new Date(workout.startedAt).toLocaleString()} · {Math.max(0, Math.round((workout.completedAt - workout.startedAt) / 60000))} min</Text>
        <Text style={styles.text}>{summarizeWorkout(workout).performed} performed sets</Text>
        <WorkoutResults workout={workout} />
      </>}
      <Link href="/" style={styles.text}>Back to Home</Link>
    </ScrollView>
  </SafeAreaView>;
}
