import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulse, pulseStyles as styles } from '@/components/training/pulse';
import { WorkoutSaveFeedback } from '@/components/training/save-feedback';
import { useTraining } from '@/training/provider';
import { upperStarter } from '@/training/routines';

interface StartChoice {
  step: 'choose' | 'confirm';
  workoutId: string;
  title: string;
}

export default function HomeScreen() {
  const { training, workout, history, isEnding } = useTraining();
  const [starting, setStarting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<StartChoice | null>(null);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      if (await training.start(upperStarter)) {
        router.navigate('/workout');
      } else {
        const current = training.getSnapshot().workout!;
        setChoice({ step: 'choose', workoutId: current.id, title: current.title });
      }
    } catch {
      setError('Could not start. Your saved data is unchanged. Try again.');
    } finally {
      setStarting(false);
    }
  }

  function cancel() {
    if (replacing) return;
    setChoice(null);
    setError(null);
  }

  function resume() {
    setChoice(null);
    setError(null);
    router.navigate('/workout');
  }

  async function replace() {
    if (!choice || replacing) return;
    setReplacing(true);
    setError(null);
    try {
      await training.replaceActiveWorkout(upperStarter, choice.workoutId);
      setChoice(null);
      router.navigate('/workout');
    } catch {
      setError('Could not replace the workout. Resume your current workout or retry.');
    } finally {
      setReplacing(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.muted}>PROJECT ULTRA</Text>
        <Text style={styles.title}>Ready when you are.</Text>
        <Text style={styles.muted}>Your training, at your pace.</Text>
        {workout && <View style={styles.card}>
          <Text style={styles.muted}>ACTIVE WORKOUT</Text>
          <Text style={styles.heading}>{workout.title}</Text>
          <Text style={styles.muted}>
            {workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.performed).length} sets performed
          </Text>
          <WorkoutSaveFeedback />
          <Link href="/workout" asChild>
            <Pressable accessibilityRole="button" style={styles.button}>
              <Text style={styles.buttonText}>Resume workout</Text>
            </Pressable>
          </Link>
        </View>}
        <View style={styles.card}>
          <Text style={styles.muted}>YOUR ROUTINE</Text>
          <Text style={styles.heading}>{upperStarter.title}</Text>
          <Text style={styles.muted}>3 exercises · 7 sets</Text>
          <Text style={styles.muted}>Lat pulldown · Chest press · Overhead press</Text>
          <Text style={styles.muted}>A weighted subset of UPPER to get started.</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting || isEnding }}
            disabled={starting || isEnding} onPress={start} style={[styles.button, starting && { opacity: 0.6 }]}>
            <Text style={styles.buttonText}>{starting ? 'Starting…' : 'Start workout'}</Text>
          </Pressable>
          {error && !choice && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        </View>
        {history.length > 0 && <View style={styles.card}>
          <Text style={styles.heading}>Workout history</Text>
          {history.map((entry) => <Link key={entry.id} href={{ pathname: '/history/[id]', params: { id: entry.id } }} asChild>
            <Pressable accessibilityRole="button" style={localStyles.historyEntry}>
              <Text style={styles.text}>{entry.title}</Text>
              <Text style={styles.muted}>{new Date(entry.startedAt).toLocaleDateString()} · {Math.max(0, Math.round((entry.completedAt - entry.startedAt) / 60000))} min · {entry.performedSetCount} performed sets</Text>
            </Pressable>
          </Link>)}
        </View>}
      </ScrollView>
      <Modal visible={choice !== null} transparent animationType="fade" onRequestClose={cancel}>
        <SafeAreaView style={localStyles.backdrop}>
          <View accessibilityViewIsModal style={localStyles.dialog}>
            <ScrollView contentContainerStyle={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>
              {choice?.step === 'choose' ? 'A workout is already active' : 'Discard current workout?'}
            </Text>
            <Text style={styles.text}>Current: {choice?.title}</Text>
            {choice?.step === 'confirm' && <>
              <Text style={styles.text}>Start: {upperStarter.title}</Text>
              <Text style={styles.muted}>This removes the current workout, including its sets and any unsaved or incomplete input.</Text>
            </>}
            <WorkoutSaveFeedback />
            {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            {replacing ? <View style={localStyles.progress}>
              <ActivityIndicator color={pulse.accent} />
              <Text accessibilityLiveRegion="polite" style={styles.text}>Starting new workout…</Text>
            </View> : <>
              <Pressable accessibilityRole="button" style={styles.button} onPress={resume}>
                <Text style={styles.buttonText}>Resume current workout</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={[styles.button, localStyles.discard]}
                onPress={() => choice?.step === 'choose' ? setChoice({ ...choice, step: 'confirm' }) : void replace()}>
                <Text style={styles.buttonText}>{choice?.step === 'choose' ? 'Discard and start…' : error ? 'Retry discard and start' : 'Confirm discard and start'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={localStyles.cancel} onPress={cancel}>
                <Text style={styles.text}>Cancel</Text>
              </Pressable>
            </>}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
  historyEntry: { minHeight: 48, paddingVertical: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: pulse.border },
  backdrop: { flex: 1, backgroundColor: '#000000AA', padding: 24, justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 480, maxHeight: '100%', flexShrink: 1 },
  discard: { backgroundColor: pulse.error },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  progress: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
});
