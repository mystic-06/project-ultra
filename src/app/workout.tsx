import { Link, router } from 'expo-router';
import { useState, useRef, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { catalogueExercise } from '@/training/catalogue';
import { EquipmentSelector } from '@/components/training/equipment-selector';
import { RestTimer } from '@/components/training/rest-timer';
import { pulse, pulseStyles } from '@/components/training/pulse';
import { EditAction, EditActions } from '@/components/training/workout-edit-controls';
import type { WorkoutChange } from '@/training/workout-changes';
import { useTraining } from '@/training/provider';
import type { SetEntry, Training } from '@/training/workout';

export default function WorkoutScreen() {
  const { training, workout, isEnding, isAdapting, equipmentSetups, loadUnit } = useTraining();
  const busy = isEnding || isAdapting;
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ change: WorkoutChange; label: string } | null>(null);
  async function apply(change: WorkoutChange) {
    if (!workout || busy) return;
    setError(null);
    try { await training.adaptWorkout(workout.id, change); setConfirmation(null); }
    catch { setError('Could not save this change. Your workout is kept. Try again.'); }
  }
  return (
    <SafeAreaView style={pulseStyles.screen} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={pulseStyles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={pulseStyles.content} automaticallyAdjustKeyboardInsets>
          {!workout ? <View style={pulseStyles.card}>
            <Text style={pulseStyles.heading}>No active workout</Text>
            <Link href="/" style={pulseStyles.text}>Go Home to start a routine</Link>
          </View> : <>
            <Text style={pulseStyles.muted}>ACTIVE WORKOUT · {loadUnit.toUpperCase()}</Text>
            <Text style={pulseStyles.title}>{workout.title}</Text>
            <Text style={pulseStyles.muted}>Enter your numbers. Check a set when performed.</Text>
            <RestTimer />
            <EditActions>
              <EditAction label="Add exercise" disabled={busy} onPress={() => router.push({ pathname: '/exercises', params: { workoutId: workout.id } })} />
              <EditAction label={managing ? 'Done arranging' : 'Arrange exercises and sets'} disabled={busy} onPress={() => setManaging(!managing)} />
            </EditActions>
            {error && <Text accessibilityLiveRegion="polite" style={pulseStyles.error}>{error}</Text>}
            {busy && <Text accessibilityLiveRegion="polite" style={pulseStyles.muted}>Saving workout…</Text>}
            {confirmation && <View style={pulseStyles.card}>
              <Text style={pulseStyles.heading}>{confirmation.label}?</Text>
              <Text style={pulseStyles.muted}>This removes the selected entries and checks from this workout. Your routine stays unchanged.</Text>
              <EditAction label="Confirm change" disabled={busy} onPress={() => void apply(confirmation.change)} />
              <EditAction label="Cancel change" disabled={busy} onPress={() => setConfirmation(null)} />
            </View>}
            {workout.exercises.length === 0 && <Text style={pulseStyles.text}>Your workout is empty. Add an exercise to begin.</Text>}
            {workout.exercises.map((exercise, exerciseIndex) => <View key={exercise.id} style={styles.exercise}>
              <Text style={pulseStyles.heading}>{exercise.name}</Text>
              <Text style={pulseStyles.muted}>{exercise.loadConvention} · {loadUnit}</Text>
              {['machine', 'cable'].includes(catalogueExercise(exercise.exerciseId).equipment) && <EquipmentSelector training={training} exercise={exercise} setups={equipmentSetups} disabled={busy} />}
              {managing && <EditActions>
                <EditAction label={`Move ${exercise.name} up`} disabled={busy || exerciseIndex === 0} onPress={() => void apply({ type: 'move-exercise', exerciseId: exercise.id, direction: -1 })} />
                <EditAction label={`Move ${exercise.name} down`} disabled={busy || exerciseIndex === workout.exercises.length - 1} onPress={() => void apply({ type: 'move-exercise', exerciseId: exercise.id, direction: 1 })} />
                <EditAction label={`Replace ${exercise.name}`} disabled={busy} onPress={() => router.push({ pathname: '/exercises', params: { workoutId: workout.id, replaceId: exercise.id } })} />
                <EditAction label={`Remove ${exercise.name}`} disabled={busy} onPress={() => setConfirmation({ label: `Remove ${exercise.name}`, change: { type: 'remove-exercise', exerciseId: exercise.id } })} />
              </EditActions>}
              {exercise.entryMode !== 'weighted' && <Text style={pulseStyles.muted}>{exercise.entryMode} logging is not available yet. You can arrange this exercise and its sets.</Text>}
              <View style={styles.row} accessibilityElementsHidden>
                <Text style={[styles.columnLabel, styles.identity]}>Set</Text>
                <Text style={[styles.columnLabel, styles.previous]}>Previous</Text>
                <Text style={[styles.columnLabel, styles.input]}>{loadUnit}</Text>
                <Text style={[styles.columnLabel, styles.input]}>Reps</Text>
                <Text style={[styles.columnLabel, styles.check]}>Check</Text>
              </View>
              {exercise.sets.map((set, index) => <View key={set.id}>
                {exercise.entryMode === 'weighted'
                  ? <SetRow set={set} index={index} exerciseName={exercise.name} training={training} loadUnit={loadUnit} disabled={busy} />
                  : <Text style={pulseStyles.text}>Set {index + 1} · Not entered</Text>}
                {managing && <EditActions>
                  <EditAction label={`Move set ${index + 1} up`} disabled={busy || index === 0} onPress={() => void apply({ type: 'move-set', exerciseId: exercise.id, setId: set.id, direction: -1 })} />
                  <EditAction label={`Move set ${index + 1} down`} disabled={busy || index === exercise.sets.length - 1} onPress={() => void apply({ type: 'move-set', exerciseId: exercise.id, setId: set.id, direction: 1 })} />
                  <EditAction label={`Reset set ${index + 1}`} disabled={busy} onPress={() => setConfirmation({ label: `Reset set ${index + 1}`, change: { type: 'replace-set', exerciseId: exercise.id, setId: set.id } })} />
                  <EditAction label={`Remove set ${index + 1}`} disabled={busy} onPress={() => setConfirmation({ label: `Remove set ${index + 1}`, change: { type: 'remove-set', exerciseId: exercise.id, setId: set.id } })} />
                </EditActions>}
              </View>)}
              <EditAction label={`Add set to ${exercise.name}`} disabled={busy} onPress={() => void apply({ type: 'add-set', exerciseId: exercise.id })} />
            </View>)}
            <Link href="/finish" asChild>
              <Pressable style={pulseStyles.button} accessibilityRole="button"><Text style={pulseStyles.buttonText}>Review and finish</Text></Pressable>
            </Link>
            <Link href="/" asChild>
              <Pressable style={styles.leave} accessibilityRole="button"><Text style={pulseStyles.text}>Back to Home</Text></Pressable>
            </Link>
          </>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SetRow({ set, index, exerciseName, training, loadUnit, disabled }: { set: SetEntry; index: number; exerciseName: string; training: Training; loadUnit: 'kg' | 'lb'; disabled: boolean }) {
  const repsInput = useRef<ComponentRef<typeof TextInput>>(null);
  const label = `${exerciseName}, set ${index + 1}`;
  const target = `${set.targetMin === 0 && set.targetMax === 0 ? 'No rep target' : `${set.targetMin}–${set.targetMax} reps`}${set.type === 'warmup' ? ' · Warm-up' : set.type === 'drop' ? ' · Drop set' : ''}`;
  const durability = set.status === 'saving' ? 'Saving…' : set.status === 'failed' ? 'Save failed' : set.status === 'editing' ? 'Incomplete input · not saved' : 'Saved';
  const status = set.inputState === 'incomplete' && set.status !== 'editing'
    ? set.status === 'saved' ? 'Incomplete set · values saved' : `Incomplete set · ${durability.toLowerCase()}`
    : durability;
  return <View style={styles.set}>
    <Text style={styles.target}>{target}</Text>
    <View style={styles.row}>
      <Text style={[pulseStyles.text, styles.identity]}>{index + 1}</Text>
      <Text style={[pulseStyles.muted, styles.previous]} accessibilityLabel="No previous result">—</Text>
      <TextInput editable={!disabled} style={[styles.input, styles.field]} value={set.load} placeholder="—" placeholderTextColor={pulse.secondary}
        accessibilityLabel={`${label}, load in ${loadUnit === 'kg' ? 'kilograms' : 'pounds'}`} keyboardType="decimal-pad" selectTextOnFocus
        autoCorrect={false} returnKeyType="next" submitBehavior="submit"
        onSubmitEditing={() => repsInput.current?.focus()} onBlur={() => { void training.blurSet(set.id); }}
        onChangeText={(load) => { void training.editSet(set.id, { load }); }} />
      <TextInput editable={!disabled} ref={repsInput} style={[styles.input, styles.field]} value={set.reps} placeholder="—" placeholderTextColor={pulse.secondary}
        accessibilityLabel={`${label}, reps`} keyboardType="number-pad" selectTextOnFocus
        autoCorrect={false} returnKeyType="done"
        onBlur={() => { void training.blurSet(set.id); }} onChangeText={(reps) => { void training.editSet(set.id, { reps }); }} />
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${label}, performed`} disabled={disabled} accessibilityState={{ checked: set.performed, disabled }}
        onPress={() => { void training.setPerformed(set.id, !set.performed); }}
        style={[styles.check, styles.checkButton, set.performed && styles.checked]}>
        <Text style={[styles.checkText, set.performed && { color: pulse.onAccent }]}>{set.performed ? '✓' : '○'}</Text>
      </Pressable>
    </View>
    <View style={styles.feedback}>
      <Text accessibilityLiveRegion="polite" style={[styles.status, set.status === 'failed' && pulseStyles.error]}>{status}</Text>
      {set.status === 'failed' && <Pressable accessibilityRole="button" accessibilityLabel={`Retry saving ${label}`} style={styles.retry}
        onPress={() => { void training.retrySet(set.id); }}><Text style={styles.retryText}>Retry</Text></Pressable>}
    </View>
    {set.error && <Text style={pulseStyles.error}>{set.error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  exercise: { gap: 8, borderBottomWidth: 1, borderBottomColor: pulse.border, paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  columnLabel: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 12, textAlign: 'center' },
  identity: { width: 28, textAlign: 'center' },
  previous: { flex: 0.9, textAlign: 'center' },
  input: { flex: 1, minWidth: 48, textAlign: 'center' },
  check: { width: 48, textAlign: 'center' },
  field: { backgroundColor: pulse.input, color: pulse.text, borderRadius: 8, minHeight: 48, padding: 6, fontSize: 16, fontFamily: 'Manrope', fontVariant: ['tabular-nums'] },
  set: { gap: 6, paddingVertical: 8 },
  target: { color: pulse.secondary, fontFamily: 'Manrope', fontSize: 13, marginLeft: 34 },
  checkButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: pulse.input, borderRadius: 8 },
  checked: { backgroundColor: pulse.accent },
  checkText: { color: pulse.secondary, fontSize: 24 },
  feedback: { flexDirection: 'row', alignItems: 'center', marginLeft: 34, minHeight: 24 },
  status: { fontFamily: 'Manrope', fontSize: 12, color: pulse.secondary, flex: 1 },
  retry: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  retryText: { color: pulse.accent, fontFamily: 'Manrope', fontWeight: '700' },
  leave: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: pulse.border, borderRadius: 10 },
});
