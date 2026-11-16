import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pulse, pulseStyles as styles } from '@/components/training/pulse';
import { WorkoutSaveFeedback } from '@/components/training/save-feedback';
import { useLocalDate } from '@/hooks/use-local-date';
import { useTraining } from '@/training/provider';
import { upperStarter, type Routine } from '@/training/routines';

interface StartChoice {
  step: 'choose' | 'confirm';
  workoutId: string;
  title: string;
  selected: Routine;
}

export default function HomeScreen() {
  const { training, workout, history, isEnding, isAdapting } = useTraining();
  const busy = isEnding || isAdapting;
  const now = useLocalDate();
  const activity = training.getWeeklyActivity(now);
  const greeting = ['Ready when you are.', 'Make time for you.', 'One set at a time.'][new Date(now).getDate() % 3];
  const [starting, setStarting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<StartChoice | null>(null);

  async function start(selected: Routine = upperStarter) {
    setStarting(true);
    setError(null);
    try {
      if (await training.start(selected)) {
        router.navigate('/workout');
      } else {
        const current = training.getSnapshot().workout!;
        setChoice({ step: 'choose', workoutId: current.id, title: current.title, selected });
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
      await training.replaceActiveWorkout(choice.selected, choice.workoutId);
      setChoice(null);
      router.navigate('/workout');
    } catch {
      setError('Could not replace the workout. Resume your current workout or retry.');
    } finally {
      setReplacing(false);
    }
  }

  const routineCard = <View style={[styles.card, !workout && localStyles.hero]}>
    <Text style={localStyles.eyebrow}>{workout ? 'YOUR ROUTINE' : 'LET’S TRAIN'}</Text>
    <Text style={styles.heading}>{upperStarter.title}</Text>
    <Text style={styles.muted}>{upperStarter.exercises.length} exercises · {upperStarter.exercises.reduce((total, exercise) => total + exercise.sets.length, 0)} sets</Text>
    <Text style={styles.muted}>{upperStarter.exercises.map((exercise) => exercise.name).join(' · ')}</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting || busy }}
      disabled={starting || busy} onPress={() => void start()} style={[styles.button, (starting || busy) && { opacity: 0.6 }]}>
      <Text style={styles.buttonText}>{starting ? 'Starting…' : workout ? 'Start another workout' : 'Start workout'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={starting || busy} style={localStyles.cancel}
      onPress={() => void start({ id: 'unplanned', title: 'Workout', exercises: [] })}>
      <Text style={styles.text}>Start empty workout</Text>
    </Pressable>
    {error && !choice && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
  </View>;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <FlatList data={history} keyExtractor={(entry) => entry.id} contentContainerStyle={styles.content}
        ListHeaderComponent={<View style={localStyles.header}>
          <View style={localStyles.greeting}>
            <Text style={localStyles.eyebrow}>PROJECT ULTRA</Text>
            <Link href="./settings" style={styles.text}>Settings</Link>
            <Text accessibilityRole="header" style={styles.title}>{greeting}</Text>
          </View>
          {workout ? <View style={[styles.card, localStyles.hero]}>
            <Text style={localStyles.eyebrow}>IN PROGRESS</Text>
            <Text style={styles.heading}>{workout.title}</Text>
            <Text style={styles.muted}>{workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.performed).length} sets performed</Text>
            <WorkoutSaveFeedback />
            <Link href="/workout" asChild>
              <Pressable accessibilityRole="button" style={styles.button}><Text style={styles.buttonText}>Resume workout</Text></Pressable>
            </Link>
          </View> : routineCard}
          <View style={[styles.card, localStyles.week]}>
            <Text style={localStyles.eyebrow}>THIS WEEK</Text>
            <Text accessibilityLiveRegion="polite" style={styles.heading}>{activity.completedCount} {activity.completedCount === 1 ? 'workout' : 'workouts'} completed</Text>
            <Text style={styles.muted}>
              {new Date(activity.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(activity.endsAt - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · Mon–Sun
            </Text>
          </View>
          {workout && routineCard}
          <Text accessibilityRole="header" style={styles.heading}>Recent workouts</Text>
        </View>}
        ListEmptyComponent={<View style={styles.card}>
          <Text style={styles.heading}>Your first workout starts here.</Text>
          <Text style={styles.muted}>Completed sessions will appear here. Start the routine above whenever you’re ready.</Text>
        </View>}
        renderItem={({ item: entry }) => <Link href={{ pathname: '/history/[id]', params: { id: entry.id } }} asChild>
          <Pressable accessibilityRole="button" style={StyleSheet.flatten([styles.card, localStyles.historyEntry])}>
            <Text style={localStyles.eyebrow}>{new Date(entry.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
            <Text style={styles.heading}>{entry.title}</Text>
            <Text style={styles.text}>{Math.max(0, Math.round((entry.completedAt - entry.startedAt) / 60000))} min · {entry.performedSetCount} performed sets</Text>
            {entry.exerciseNames.length > 0 && <Text style={styles.muted} numberOfLines={2}>
              {entry.exerciseNames.slice(0, 3).join(' · ')}{entry.exerciseNames.length > 3 ? ' …' : ''}
            </Text>}
            <Text style={localStyles.open}>View workout →</Text>
          </Pressable>
        </Link>}
      />
      <Modal visible={choice !== null} transparent animationType="fade" onRequestClose={cancel}>
        <SafeAreaView style={localStyles.backdrop}>
          <View accessibilityViewIsModal style={localStyles.dialog}>
            <ScrollView contentContainerStyle={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>
              {choice?.step === 'choose' ? 'A workout is already active' : 'Discard current workout?'}
            </Text>
            <Text style={styles.text}>Current: {choice?.title}</Text>
            {choice?.step === 'confirm' && <>
              <Text style={styles.text}>Start: {choice?.selected.title}</Text>
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
  header: { gap: 20 },
  greeting: { gap: 8, paddingVertical: 8 },
  eyebrow: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 12, letterSpacing: 1.5, fontWeight: '700' },
  hero: { borderWidth: 1, borderColor: pulse.accent, gap: 14 },
  week: { gap: 8 },
  historyEntry: { gap: 10, minHeight: 48 },
  open: { color: pulse.accent, fontFamily: 'Manrope', fontSize: 14, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: '#000000AA', padding: 24, justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 480, maxHeight: '100%', flexShrink: 1 },
  discard: { backgroundColor: pulse.error },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  progress: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
});
