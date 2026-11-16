import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulseStyles as styles } from '@/components/training/pulse';
import { WorkoutSaveFeedback } from '@/components/training/save-feedback';
import { WorkoutResults } from '@/components/training/workout-results';
import { useTraining } from '@/training/provider';
import { summarizeWorkout } from '@/training/workout';

export default function FinishScreen() {
  const { training, workout, isEnding, saveStatus } = useTraining();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = workout ? summarizeWorkout(workout) : null;

  async function end(discard: boolean) {
    if (!workout || isEnding) return;
    setError(null);
    try {
      if (discard) {
        await training.discardWorkout(workout.id);
        router.replace('/');
      } else {
        await training.finishWorkout(workout.id);
        router.replace({ pathname: '/history/[id]', params: { id: workout.id } });
      }
    } catch {
      setError(discard ? 'Could not discard. Your workout is still available. Retry or keep training.' : 'Could not finish. Your workout is still available. Retry or keep training.');
    }
  }

  return <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      {!workout || !counts ? <>
        <Text style={styles.heading}>No active workout</Text>
        <Link href="/" style={styles.text}>Go Home</Link>
      </> : <>
        <Text style={styles.title}>Finish {workout.title}?</Text>
        <Text style={styles.text}>{counts.performed} performed · {counts.unfinished} entered, unchecked · {counts.untouched} not entered</Text>
        <Text style={styles.muted}>Correct forgotten checks below, or keep training to edit your entries. Unchecked sets stay Unfinished in history.</Text>
        <WorkoutSaveFeedback />
        {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <WorkoutResults workout={workout} disabled={isEnding} onCheck={(id, performed) => {
          setConfirmDiscard(false);
          void training.setPerformed(id, performed);
        }} />
        <Link href="/workout" asChild>
          <Pressable accessibilityRole="button" disabled={isEnding} style={styles.button}>
            <Text style={styles.buttonText}>Keep training</Text>
          </Pressable>
        </Link>
        {counts.performed > 0 ? <>
          {saveStatus !== 'saved' && <Text style={styles.muted}>Save or correct your latest entries before finishing.</Text>}
          <Pressable accessibilityRole="button" disabled={isEnding || saveStatus !== 'saved'}
            accessibilityState={{ disabled: isEnding || saveStatus !== 'saved' }}
            style={[styles.button, (isEnding || saveStatus !== 'saved') && { opacity: 0.6 }]} onPress={() => void end(false)}>
            <Text style={styles.buttonText}>{isEnding ? 'Saving workout…' : error ? 'Retry finish' : 'Finish workout'}</Text>
          </Pressable>
        </> : <View style={styles.card}>
          <Text style={styles.heading}>No performed sets</Text>
          <Text style={styles.muted}>Keep training or discard this workout.</Text>
          {confirmDiscard && <Text style={styles.error}>Discard {workout.title}? This removes all its entries, including unsaved input.</Text>}
          <Pressable accessibilityRole="button" disabled={isEnding} style={styles.button}
            onPress={() => confirmDiscard ? void end(true) : setConfirmDiscard(true)}>
            <Text style={styles.buttonText}>{isEnding ? 'Discarding…' : confirmDiscard ? 'Confirm discard workout' : 'Discard workout…'}</Text>
          </Pressable>
          {confirmDiscard && <Pressable accessibilityRole="button" disabled={isEnding} style={styles.button} onPress={() => setConfirmDiscard(false)}>
            <Text style={styles.buttonText}>Cancel discard</Text>
          </Pressable>}
        </View>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
